import { requestJson } from './http'
import type {
  ApprovalDecision,
  CreateRunInput,
  CreateSessionInput,
  HarnessEvent,
  HarnessMessage,
  HarnessRunState,
  HarnessSessionState,
  ModelOption,
  PlanIdentity,
  QueueInputInput,
} from '../types/harness'

const base = '/coding/harness'
const encode = encodeURIComponent
interface UploadedAttachment { fileName: string; url: string; ossId: string }
const attachmentUploads = new WeakMap<File, Promise<UploadedAttachment>>()

async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  const existing = attachmentUploads.get(file)
  if (existing) return existing
  const body = new FormData()
  body.append('file', file, file.name)
  const pending = requestJson<UploadedAttachment>('/resource/oss/upload', { method: 'POST', body })
    .then(result => {
      if (!result.url || !/^https?:\/\//i.test(result.url)) throw new Error('上传接口未返回有效文件 URL')
      return result
    }).catch(error => { attachmentUploads.delete(file); throw error })
  attachmentUploads.set(file, pending)
  return pending
}

export const harnessApi = {
  uploadAttachments: async (files: readonly File[]) => {
    const uploaded: UploadedAttachment[] = []
    for (const file of files) uploaded.push(await uploadAttachment(file))
    return uploaded
  },
  listSessions: () => requestJson<HarnessSessionState[]>(`${base}/sessions`),
  pinSession: (sessionId: string, pinned: boolean) => requestJson<HarnessSessionState>(
    `${base}/sessions/${encode(sessionId)}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) },
  ),
  deleteSession: (sessionId: string) => requestJson<void>(`${base}/sessions/${encode(sessionId)}`, {
    method: 'DELETE',
  }),
  restoreSession: (sessionId: string) => requestJson<HarnessSessionState>(
    `${base}/sessions/${encode(sessionId)}/restore`, { method: 'POST' },
  ),
  createSession: (input: CreateSessionInput) => requestJson<HarnessSessionState>(`${base}/sessions`, {
    method: 'POST', body: JSON.stringify(input),
  }),
  getSession: (sessionId: string) => requestJson<HarnessSessionState>(`${base}/sessions/${encode(sessionId)}`),
  listRuns: (sessionId: string) => requestJson<HarnessRunState[]>(`${base}/sessions/${encode(sessionId)}/runs`),
  getRun: (sessionId: string, runId: string) => requestJson<HarnessRunState>(
    `${base}/sessions/${encode(sessionId)}/runs/${encode(runId)}`,
  ),
  createRun: (sessionId: string, input: CreateRunInput) => requestJson<HarnessRunState>(
    `${base}/sessions/${encode(sessionId)}/runs`, { method: 'POST', body: JSON.stringify(input) },
  ),
  messages: (sessionId: string, afterSequence = 0, limit = 10_000) => requestJson<HarnessMessage[]>(
    `${base}/sessions/${encode(sessionId)}/messages?afterSequence=${afterSequence}&limit=${limit}`,
  ),
  events: (sessionId: string, runId: string, afterSequence = 0, limit = 10_000) => requestJson<HarnessEvent[]>(
    `${base}/sessions/${encode(sessionId)}/runs/${encode(runId)}/events?afterSequence=${afterSequence}&limit=${limit}`,
  ),
  queueInput: (sessionId: string, runId: string, input: QueueInputInput) =>
    requestJson<HarnessRunState>(`${base}/sessions/${encode(sessionId)}/runs/${encode(runId)}/inputs`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  cancel: (sessionId: string, runId: string) => requestJson<HarnessRunState>(
    `${base}/sessions/${encode(sessionId)}/runs/${encode(runId)}/cancel`, { method: 'POST' },
  ),
  resume: (sessionId: string, runId: string) => requestJson<HarnessRunState>(
    `${base}/sessions/${encode(sessionId)}/runs/${encode(runId)}/resume`, { method: 'POST' },
  ),
  resolveApproval: (
    sessionId: string,
    runId: string,
    approvalId: string,
    input: {
      decisionId: string
      decision: ApprovalDecision
      expectedRevision: number
      argumentsSha256: string
      note?: string
    },
  ) => requestJson<HarnessRunState>(
    `${base}/sessions/${encode(sessionId)}/runs/${encode(runId)}/approvals/${encode(approvalId)}/resolve`,
    { method: 'POST', body: JSON.stringify(input) },
  ),
  approvePlan: (sessionId: string, runId: string, plan: PlanIdentity, idempotencyKey: string) =>
    requestJson<HarnessRunState>(`${base}/sessions/${encode(sessionId)}/runs/${encode(runId)}/plan/approve`, {
      method: 'POST',
      body: JSON.stringify({
        taskId: plan.taskId,
        expectedRevision: plan.revision,
        expectedHash: plan.hash,
        idempotencyKey,
      }),
    }),
  requestPlanRevision: (
    sessionId: string,
    runId: string,
    plan: PlanIdentity,
    feedbackId: string,
    content: string,
  ) => requestJson<HarnessRunState>(
    `${base}/sessions/${encode(sessionId)}/runs/${encode(runId)}/plan/revision`, {
      method: 'POST',
      body: JSON.stringify({
        taskId: plan.taskId,
        expectedRevision: plan.revision,
        expectedHash: plan.hash,
        feedbackId,
        content,
      }),
    },
  ),
  listModels: async (): Promise<ModelOption[]> => {
    const rows = await requestJson<unknown[]>('/system/model/modelList')
    const configured = rows.flatMap((row) => {
      if (typeof row !== 'object' || row === null) return []
      const item = row as Record<string, unknown>
      const rawName = item.modelName ?? item.name
      const name = typeof rawName === 'string' ? rawName : ''
      if (!name) return []
      const rawId = item.id ?? item.modelConfigId ?? name
      return [{
        id: String(rawId),
        name,
        provider: typeof (item.providerCode ?? item.provider) === 'string'
          ? String(item.providerCode ?? item.provider)
          : undefined,
      }]
    })
    const hasDeepSeek = configured.some((model) => model.name.startsWith('deepseek-v4-'))
    return hasDeepSeek
      ? [{ id: 'deepseek-auto', name: 'deepseek-auto', provider: '自动：Flash / Pro / Vision' }, ...configured]
      : configured
  },
}
