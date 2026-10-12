import { describe, expect, it, vi } from 'vitest'
import { exportHarnessTrace } from './exportHarnessTrace'
import type { HarnessEvent, HarnessMessage, HarnessRunState, HarnessSessionState } from '../types/harness'

function fixture(messageCount = 3) {
  const session = { sessionId: 'case-1', revision: 1, model: 'doubao-seed-evolving' } as HarnessSessionState
  const runs = ['run-1', 'run-2'].map((runId, index) => ({ runId, sessionId: 'case-1', revision: 2, status: 'COMPLETED', createdAt: index })) as HarnessRunState[]
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    schemaVersion: 1, messageId: `message-${i}`, toolCallId: null, toolName: null, toolError: false, usage: {}, metadata: {}, timestamp: i,
    sessionId: 'case-1', runId: i % 2 ? 'run-2' : 'run-1', sequence: i + 1, role: i % 2 ? 'TOOL' : 'ASSISTANT',
    content: `完整内容\n${i}`, thinking: '模型返回的思考', toolCalls: [{ toolCallId: `call-${i}`, toolName: 'read_file', arguments: '{"path":"src/main.ts"}' }],
  })) as HarnessMessage[]
  const api = {
    getSession: vi.fn(async () => ({ ...session })),
    listRuns: vi.fn(async () => runs.map((run) => ({ ...run }))),
    messages: vi.fn(async (_id: string, after = 0, limit = 1_000) => messages.filter((row) => row.sequence > after).slice(0, limit)),
    events: vi.fn(async (_id: string, runId: string, after = 0) => after ? [] : [{ sessionId: 'case-1', runId, sequence: 1, type: 'approval.resolved', data: { decision: 'APPROVE' } } as unknown as HarnessEvent]),
  }
  return { api, runs, messages }
}

describe('complete session JSONL export', () => {
  it('exports over 10,000 messages, every run and every event without UI truncation', async () => {
    const { api, messages } = fixture(10_001)
    const result = await exportHarnessTrace('case-1', api)
    const rows = result.jsonl.trimEnd().split('\n').map((line) => JSON.parse(line))
    expect(result.counts).toEqual({ runs: 2, messages: 10_001, events: 2 })
    expect(rows.filter((row) => row.recordType === 'message').map((row) => row.data)).toEqual(messages)
    expect(rows[0].recordType).toBe('manifest')
    expect(rows.at(-1)).toMatchObject({ recordType: 'end', complete: true })
    expect(api.messages).toHaveBeenLastCalledWith('case-1', 10_001, 1_000)
  })
  it('refuses a nonterminal run so a partial trace is never labelled complete', async () => {
    const { api, runs } = fixture()
    runs[1]!.status = 'WAITING_FOR_APPROVAL'
    await expect(exportHarnessTrace('case-1', api)).rejects.toThrow('待审批')
  })
  it('fails closed when a page repeats its cursor or contains a gap', async () => {
    const { api, messages } = fixture()
    messages[1]!.sequence = 1
    await expect(exportHarnessTrace('case-1', api)).rejects.toThrow('序号不连续')
    messages[1]!.sequence = 4
    await expect(exportHarnessTrace('case-1', api)).rejects.toThrow('序号不连续')
  })
  it('rejects a new run arriving while exporting', async () => {
    const { api, runs } = fixture()
    api.listRuns.mockResolvedValueOnce([...runs]).mockResolvedValueOnce([...runs, { ...runs[0]!, runId: 'new-run' }])
    await expect(exportHarnessTrace('case-1', api)).rejects.toThrow('发生变化')
  })
  it('propagates a later page failure without offering a partial download', async () => {
    const { api } = fixture(1_001)
    api.messages.mockImplementationOnce(async () => fixture(1_000).messages).mockRejectedValueOnce(new Error('network failure'))
    await expect(exportHarnessTrace('case-1', api)).rejects.toThrow('network failure')
  })
  it('rejects records belonging to another session', async () => {
    const { api, messages } = fixture()
    messages[0]!.sessionId = 'another-session'
    await expect(exportHarnessTrace('case-1', api)).rejects.toThrow('归属')
  })
  it('refuses offloaded payload pointers instead of claiming the full tool body was exported', async () => {
    const { api, messages } = fixture()
    messages[0]!.content = JSON.stringify({ offloaded: true, artifactId: 'sha256-blob', headPreview: 'partial' })
    await expect(exportHarnessTrace('case-1', api)).rejects.toThrow('外置制品')
    messages[0]!.content = 'visible answer'
    messages[0]!.metadata = { oversizedThinkingOmitted: true }
    await expect(exportHarnessTrace('case-1', api)).rejects.toThrow('已省略正文')
  })
})
