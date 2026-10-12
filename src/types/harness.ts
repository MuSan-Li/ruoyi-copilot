export type HarnessPermissionMode = 'READ_ONLY' | 'WORKSPACE_WRITE' | 'FULL_ACCESS'
export type HarnessApprovalPolicy = 'ON_REQUEST' | 'NEVER'

/** 字节 Doubao-Seed-Evolving 思考等级（reasoning_effort）。none 关闭思考。 */
export type HarnessThinkingLevel =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

/** 会话验证归属：AGENT 智能体自验证（默认）；EXTERNAL 独立外部验收。 */
export type HarnessVerificationMode = 'AGENT' | 'EXTERNAL'

/** 图片精度：DeepSeek 用 auto/low/original；Doubao 用 low/high/xhigh。 */
export type HarnessImageDetail = 'auto' | 'low' | 'original' | 'high' | 'xhigh'

export type HarnessRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_FOR_APPROVAL'
  | 'WAITING_FOR_INPUT'
  | 'SUSPENDED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type HarnessInputKind = 'INITIAL' | 'STEER' | 'FOLLOW_UP'
export type HarnessMessageRole = 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL' | 'CONTROL'
export type ApprovalDecision = 'APPROVE' | 'DENY'
export type ApprovalState = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CONSUMED'
export type PlanStepStatus = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'FAILED' | 'COMPLETED' | 'SKIPPED'
export type ExecutionMode = 'PLAN' | 'BUILD' | 'VERIFY' | 'BLOCKED' | 'COMPLETED' | 'FAILED'
export type PlanReviewState = 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REVISION_REQUESTED'
export type HarnessTaskClass = 'SIMPLE' | 'COMPLEX' | 'VISION'
export type HarnessModelRouteSource = 'AUTO_POLICY' | 'SESSION_FIXED' | 'LEGACY_SESSION_FALLBACK'

export const WORKSPACE_MANIFEST_SCHEMA_VERSION = 1
export const MAX_WORKSPACE_MANIFEST_PROJECTS = 32

export interface HarnessBudget {
  maxIterations: number
  maxToolCalls: number
  maxInputTokens: number
  maxOutputTokens: number
  maxWallTimeMillis: number
}

/** Immutable server-side routing decision captured before a run is scheduled. */
export interface HarnessModelRoute {
  policyVersion: number
  requestedModel: string
  selectedModel: string
  taskClass: HarnessTaskClass
  thinkingEnabled: boolean
  source: HarnessModelRouteSource
}

export interface WorkspaceManifestProject {
  projectId: string
  relativePath: string
  displayName: string
  tags: readonly string[]
}

/** Describes projects inside one workspace lease; it never expands that lease or its permissions. */
export interface WorkspaceManifest {
  schemaVersion: number
  projects: readonly WorkspaceManifestProject[]
}

export interface HarnessSessionState {
  schemaVersion: number
  sessionId: string
  tenantId: string
  userId: number | string
  workspace: string
  workspaceManifest: WorkspaceManifest
  model: string
  permissionMode: HarnessPermissionMode
  /** Missing only on sessions created by servers predating independent approval policies. */
  approvalPolicy?: HarnessApprovalPolicy
  /** Doubao 思考等级；旧会话缺省时按 high 处理。 */
  thinkingLevel?: HarnessThinkingLevel
  /** 验证归属；旧会话缺省按 AGENT 处理。 */
  verificationMode?: HarnessVerificationMode
  title: string | null
  activeRunId: string | null
  createdAt: number
  updatedAt: number
  revision: number
  /** Server-persisted sidebar state; absent on legacy servers. */
  pinnedAt?: number
  deletedAt?: number
}

export interface HarnessQueuedInput {
  inputId: string
  kind: HarnessInputKind
  content: string
  createdAt: number
}

export interface HarnessToolCall {
  toolCallId: string
  toolName: string
  arguments: string
}

export interface HarnessUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  [key: string]: unknown
}

export interface HarnessMessage {
  schemaVersion: number
  messageId: string
  sessionId: string
  runId: string
  sequence: number
  role: HarnessMessageRole
  content: string | null
  thinking: string | null
  toolCalls: readonly HarnessToolCall[]
  toolCallId: string | null
  toolName: string | null
  toolError: boolean
  usage: HarnessUsage
  metadata: Readonly<Record<string, unknown>>
  timestamp: number
}

export interface HarnessApprovalPreview {
  approvalId: string
  toolCallId: string
  toolName: string
  capability: string | null
  summary: string | null
  argumentsPreview: Readonly<Record<string, unknown>>
  status: string
  createdAt: number
  resolvedAt: number
  resolvedBy: number | string | null
  resolutionNote: string | null
}

export interface ToolCallApproval {
  schemaVersion: number
  approvalId: string
  runId: string
  toolCallId: string
  toolName: string
  argumentsSha256: string
  sessionId: string
  permissionMode: HarnessPermissionMode
  permissionRevision: number
  state: ApprovalState
  revision: number
  createdAt: number
  expiresAt: number
  updatedAt: number
}

export interface AcceptanceCriterion {
  id: string
  type: string
  expected: string
  evidenceKey: string | null
}

export interface TaskContract {
  contractId: string
  kind: string
  normalizedGoal: string
  criteria: readonly AcceptanceCriterion[]
  allowedMutationRoots: readonly string[]
  forbiddenOperations: readonly string[]
}

export interface PlanTaskStep {
  stepId: string
  title: string
  instructions: string
  status: PlanStepStatus
  dependencyIds: readonly string[]
  acceptanceCriterionIds: readonly string[]
  completionEvidenceIds: readonly string[]
  statusReason: string | null
  attempt: number
}

export interface PlanFeedback {
  feedbackId: string
  content: string
  createdAt: number
}

export interface ExecutionEvidence {
  evidenceId: string
  type: string
  canonicalKey: string | null
  successful: boolean
  summary?: string | null
  [key: string]: unknown
}

export interface ExecutionPlan {
  schemaVersion: number
  taskId: string
  revision: number
  mode: ExecutionMode
  reviewState: PlanReviewState
  contract: TaskContract
  originalRequest: string
  planMarkdown: string
  steps: readonly PlanTaskStep[]
  feedbackHistory: readonly PlanFeedback[]
  evidence: readonly ExecutionEvidence[]
  approvalReceipts: Readonly<Record<string, unknown>>
  blockedFromMode: ExecutionMode | null
  blockedReason: string | null
  failureReason: string | null
  createdAt: number
  updatedAt: number
  /** Current servers serialize this read-only digest; null keeps old snapshots decodable. */
  canonicalHash: string | null
}

export interface HarnessRunState {
  schemaVersion: number
  runId: string
  sessionId: string
  tenantId: string
  userId: number | string
  status: HarnessRunStatus
  originalRequirement: string
  permissionMode: HarnessPermissionMode
  permissionRevision: number
  budget: HarnessBudget
  modelRoute: HarnessModelRoute
  executionPlan: ExecutionPlan | null
  pendingInputs: readonly HarnessQueuedInput[]
  approvals: Readonly<Record<string, HarnessApprovalPreview>>
  toolApprovals: Readonly<Record<string, ToolCallApproval>>
  iteration: number
  toolCallCount: number
  cancellationRequested: boolean
  error: string | null
  createdAt: number
  updatedAt: number
  revision: number
  [key: string]: unknown
}

export interface HarnessEvent {
  schemaVersion: number
  eventId: string
  sessionId: string
  runId: string
  sequence: number
  timestamp: number
  type: string
  stepId: string | null
  toolCallId: string | null
  approvalId: string | null
  data: Readonly<Record<string, unknown>>
}

export interface ModelOption {
  id: string
  name: string
  provider?: string
}

export interface HarnessImageInput {
  dataUrl: string
  detail: HarnessImageDetail
}

export interface PendingImageAttachment extends HarnessImageInput {
  id: string
  name: string
  mediaType: string
  byteSize: number
}

export interface CreateSessionInput {
  workspacePath?: string
  workspaceManifest?: WorkspaceManifest
  model: string
  permissionMode: HarnessPermissionMode
  approvalPolicy: HarnessApprovalPolicy
  /** Doubao 思考等级；非 Doubao 模型忽略。 */
  thinkingLevel?: HarnessThinkingLevel
  /** 验证归属；默认 AGENT。 */
  verificationMode?: HarnessVerificationMode
  title?: string
  /** Stable for every retry of the same logical session creation. */
  idempotencyKey: string
}

export interface CreateRunInput {
  requirement: string
  budget?: HarnessBudget
  images?: readonly HarnessImageInput[]
  /** Stable for every retry of the same logical run creation. */
  idempotencyKey: string
}

export interface QueueInputInput {
  kind: Exclude<HarnessInputKind, 'INITIAL'>
  content: string
  /** Stable for every retry of the same logical queued input. */
  idempotencyKey: string
}

export interface PlanIdentity {
  taskId: string
  revision: number
  hash: string
}
