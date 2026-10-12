import { harnessApi } from '../api/harnessApi'
import type { HarnessEvent, HarnessMessage, HarnessRunState, HarnessSessionState } from '../types/harness'

type TraceApi = Pick<typeof harnessApi, 'getSession' | 'listRuns' | 'messages' | 'events'>
const PAGE_SIZE = 1_000
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

/** Read the durable ledger, never the UI's last-2,000-message projection. */
async function readLedger<T extends { sequence: number }>(read: (after: number, limit: number) => Promise<T[]>): Promise<T[]> {
  const records: T[] = []
  let cursor = 0
  while (true) {
    const page = await read(cursor, PAGE_SIZE)
    if (!page.length) return records
    for (const record of page) {
      if (!Number.isSafeInteger(record.sequence) || record.sequence !== cursor + 1) {
        throw new Error('轨迹序号不连续，已停止导出。请刷新后重试。')
      }
      cursor = record.sequence
      records.push(record)
    }
  }
}

function stableRuns(runs: HarnessRunState[]): string {
  return JSON.stringify(runs.map(({ runId, revision, status }) => [runId, revision, status]).sort())
}

export interface TraceExport {
  filename: string
  jsonl: string
  counts: { runs: number; messages: number; events: number }
}

export async function exportHarnessTrace(sessionId: string, api: TraceApi = harnessApi): Promise<TraceExport> {
  const session: HarnessSessionState = await api.getSession(sessionId)
  const runs = (await api.listRuns(sessionId)).sort((a, b) => a.createdAt - b.createdAt || a.runId.localeCompare(b.runId))
  if (runs.some((run) => !TERMINAL.has(run.status))) {
    throw new Error('会话仍有执行中、待审批或暂停的任务，请完成或取消后导出完整轨迹。')
  }
  const messages: HarnessMessage[] = await readLedger((after, limit) => api.messages(sessionId, after, limit))
  if (messages.some((message) => {
    if (message.metadata?.assistantContentOffloaded || message.metadata?.oversizedThinkingOmitted) return true
    try {
      const content = JSON.parse(message.content ?? '')
      return content?.offloaded === true && typeof content.artifactId === 'string'
    } catch { return false }
  })) {
    throw new Error('轨迹包含外置制品或已省略正文，当前接口不能完整获取。请同时导出服务端制品，不能将摘要标为完整轨迹。')
  }
  const events: HarnessEvent[] = []
  for (const run of runs) events.push(...await readLedger((after, limit) => api.events(sessionId, run.runId, after, limit)))
  const [currentSession, currentRuns] = await Promise.all([api.getSession(sessionId), api.listRuns(sessionId)])
  if (session.revision !== currentSession.revision || stableRuns(runs) !== stableRuns(currentRuns)) {
    throw new Error('导出期间会话发生变化，请在任务结束后重试。')
  }
  if (messages.some((message) => message.sessionId !== sessionId || !runs.some((run) => run.runId === message.runId))
    || events.some((event) => event.sessionId !== sessionId || !runs.some((run) => run.runId === event.runId))) {
    throw new Error('轨迹归属校验失败，已停止导出。')
  }
  const counts = { runs: runs.length, messages: messages.length, events: events.length }
  const rows: unknown[] = [{
    recordType: 'manifest', schema: 'ruoyi-copilot.trace', schemaVersion: 1,
    exportedAt: new Date().toISOString(), sessionId, counts,
    complete: true, scope: 'all persisted session messages and all run events',
    ordering: 'session; runs by createdAt; messages by sequence; events by run then sequence',
    redacted: false,
  }, { recordType: 'session', data: session },
  ...runs.map((data) => ({ recordType: 'run', data })),
  ...messages.map((data) => ({ recordType: 'message', data })),
  ...events.map((data) => ({ recordType: 'event', data })),
  { recordType: 'end', sessionId, counts, complete: true }]
  return {
    filename: `ruoyi-copilot-${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`,
    jsonl: `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, counts,
  }
}
