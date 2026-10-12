import { describe, expect, it } from 'vitest'
import {
  reduceHarnessEvent,
  reduceHarnessEvents,
} from './harnessEventReducer'
import type { HarnessEvent } from '../types/harness'

function event(
  sequence: number,
  type: string,
  data: Record<string, unknown> = {},
  toolCallId?: string,
): HarnessEvent {
  return {
    schemaVersion: 1,
    eventId: `event-${sequence}`,
    sessionId: 'session-1',
    runId: 'run-1',
    sequence,
    timestamp: 1_700_000_000_000 + sequence,
    type,
    stepId: null,
    toolCallId: toolCallId ?? null,
    approvalId: null,
    data,
  }
}

describe('Harness model effect projection', () => {
  it('discards rejected text, thinking, and proposed tools for the same effect', () => {
    const projection = reduceHarnessEvents([
      event(1, 'model.turn.started', { effectId: 'effect-a' }),
      event(2, 'assistant.text.delta', { effectId: 'effect-a', delta: 'partial' }),
      event(3, 'assistant.thinking.delta', { effectId: 'effect-a', delta: 'reasoning' }),
      event(4, 'assistant.tool.complete', {
        effectId: 'effect-a', name: 'list_files', arguments: '{}',
      }, 'call-a'),
      event(5, 'model.turn.abandoned', { effectId: 'effect-a', code: 'PROVIDER_REJECTED' }),
    ])

    expect(projection.streamingTurn).toBeNull()
    expect(projection.tools).toEqual({})
  })

  it('never lets an unrelated abandon or completion terminate the active effect', () => {
    const active = reduceHarnessEvents([
      event(1, 'model.turn.started', { effectId: 'effect-a' }),
      event(2, 'assistant.text.delta', { effectId: 'effect-a', delta: 'A' }),
    ])
    const afterOtherAbandon = reduceHarnessEvent(
      active,
      event(3, 'model.turn.abandoned', { effectId: 'effect-b' }),
    )
    const afterOtherCompletion = reduceHarnessEvent(
      afterOtherAbandon,
      event(4, 'assistant.completed', { effectId: 'effect-b', messageId: 'message-b' }),
    )

    expect(afterOtherCompletion.streamingTurn).toMatchObject({
      effectId: 'effect-a', text: 'A', completed: false,
    })
  })

  it('replaces an unfinished old effect when a new model turn starts', () => {
    const projection = reduceHarnessEvents([
      event(1, 'model.turn.started', { effectId: 'effect-a' }),
      event(2, 'assistant.text.delta', { effectId: 'effect-a', delta: 'stale' }),
      event(3, 'assistant.tool.complete', {
        effectId: 'effect-a', name: 'list_files', arguments: '{}',
      }, 'call-a'),
      event(4, 'model.turn.started', { effectId: 'effect-b' }),
      event(5, 'assistant.text.delta', { effectId: 'effect-b', delta: 'fresh' }),
    ])

    expect(projection.streamingTurn).toMatchObject({
      effectId: 'effect-b', text: 'fresh', completed: false,
    })
    expect(projection.tools).toEqual({})
  })

  it('marks only a matching successful effect as completed', () => {
    const projection = reduceHarnessEvents([
      event(1, 'assistant.text.delta', { effectId: 'effect-a', delta: 'answer' }),
      event(2, 'assistant.completed', { effectId: 'effect-a', messageId: 'message-a' }),
    ])

    expect(projection.streamingTurn).toMatchObject({
      effectId: 'effect-a', text: 'answer', completed: true,
    })
  })

  it('keeps a completed draft until its durable message refresh acknowledges it', () => {
    const projection = reduceHarnessEvents([
      event(1, 'assistant.text.delta', { effectId: 'effect-a', delta: 'answer' }),
      event(2, 'assistant.completed', { effectId: 'effect-a', messageId: 'message-a' }),
      event(3, 'run.completed', { status: 'COMPLETED' }),
    ])

    expect(projection.streamingTurn).toMatchObject({
      effectId: 'effect-a', text: 'answer', completed: true,
    })
  })

  it.each([
    'model.turn.retrying',
    'run.suspended',
    'run.completed',
    'run.failed',
    'run.cancelled',
  ])(
    'defensively clears legacy unfinished projections on %s',
    (transition) => {
      const projection = reduceHarnessEvents([
        event(1, 'assistant.text.delta', { effectId: 'legacy-effect', delta: 'stale' }),
        event(2, 'assistant.tool.complete', {
          effectId: 'legacy-effect', name: 'list_files', arguments: '{}',
        }, 'legacy-call'),
        event(3, transition, {}),
      ])

      expect(projection.streamingTurn).toBeNull()
      expect(projection.tools).toEqual({})
    },
  )

  it('removes only RUNNING tools from the abandoned effect', () => {
    const projection = reduceHarnessEvents([
      event(1, 'assistant.tool.complete', {
        effectId: 'effect-a', name: 'read_file', arguments: '{}',
      }, 'call-completed'),
      event(2, 'tool.completed', { error: false, code: 'OK' }, 'call-completed'),
      event(3, 'assistant.tool.complete', {
        effectId: 'effect-a', name: 'read_file', arguments: '{}',
      }, 'call-failed'),
      event(4, 'tool.completed', { error: true, code: 'READ_FAILED' }, 'call-failed'),
      event(5, 'assistant.tool.complete', {
        effectId: 'effect-b', name: 'list_files', arguments: '{}',
      }, 'call-abandoned'),
      event(6, 'assistant.tool.complete', {
        effectId: 'effect-c', name: 'list_files', arguments: '{}',
      }, 'call-other-running'),
      event(7, 'model.turn.abandoned', { effectId: 'effect-b', code: 'PROVIDER_REJECTED' }),
    ])

    expect(projection.tools['call-completed']).toMatchObject({ status: 'COMPLETED' })
    expect(projection.tools['call-failed']).toMatchObject({ status: 'FAILED' })
    expect(projection.tools['call-other-running']).toMatchObject({
      effectId: 'effect-c', status: 'RUNNING',
    })
    expect(projection.tools['call-abandoned']).toBeUndefined()
  })

  it('keeps completed and failed tools while a legacy terminal event drops phantoms', () => {
    const projection = reduceHarnessEvents([
      event(1, 'assistant.tool.complete', {
        effectId: 'effect-a', name: 'read_file', arguments: '{}',
      }, 'call-completed'),
      event(2, 'tool.completed', { error: false, code: 'OK' }, 'call-completed'),
      event(3, 'assistant.tool.complete', {
        effectId: 'effect-b', name: 'read_file', arguments: '{}',
      }, 'call-failed'),
      event(4, 'tool.completed', { error: true, code: 'READ_FAILED' }, 'call-failed'),
      event(5, 'assistant.tool.complete', {
        effectId: 'legacy-effect', name: 'list_files', arguments: '{}',
      }, 'call-phantom'),
      event(6, 'run.completed', { status: 'COMPLETED' }),
    ])

    expect(projection.tools['call-completed']).toMatchObject({ status: 'COMPLETED' })
    expect(projection.tools['call-failed']).toMatchObject({ status: 'FAILED' })
    expect(projection.tools['call-phantom']).toBeUndefined()
  })

  it('does not resurrect abandoned drafts when the durable ledger is replayed', () => {
    const ledger = [
      event(1, 'assistant.thinking.delta', { effectId: 'effect-a', delta: 'partial' }),
      event(2, 'model.turn.abandoned', { effectId: 'effect-a', code: 'PROVIDER_REJECTED' }),
    ]

    const projection = reduceHarnessEvents(ledger)
    expect(projection.streamingTurn).toBeNull()
    expect(reduceHarnessEvent(projection, ledger[1]!)).toBe(projection)
  })
})
