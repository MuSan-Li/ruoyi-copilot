import {
  computed,
  onScopeDispose,
  reactive,
  readonly,
  shallowRef,
} from 'vue'
import { harnessApi } from '../api/harnessApi'
import type { TextAttachment } from './useFileAttachments'
import { useUrlShortcuts } from './useUrlShortcuts'
import { streamHarnessEvents } from '../api/harnessSse'
import {
  acknowledgeStreamingTurn,
  emptyHarnessProjection,
  reduceHarnessEvent,
} from '../state/harnessEventReducer'
import { createId } from '../utils/id'
import {
  MAX_WORKSPACE_MANIFEST_PROJECTS,
  WORKSPACE_MANIFEST_SCHEMA_VERSION,
} from '../types/harness'
import type {
  ApprovalDecision,
  HarnessApprovalPolicy,
  HarnessEvent,
  HarnessImageDetail,
  HarnessInputKind,
  HarnessMessage,
  HarnessPermissionMode,
  HarnessRunState,
  HarnessSessionState,
  HarnessThinkingLevel,
  HarnessVerificationMode,
  ModelOption,
  PlanIdentity,
  PendingImageAttachment,
  WorkspaceManifest,
  WorkspaceManifestProject,
} from '../types/harness'
import {
  DEFAULT_DOUBAO_IMAGE_DETAIL,
  DEFAULT_THINKING_LEVEL,
  isDoubaoModel,
  modelSupportsImages,
} from '../utils/modelCapabilities'

type ConnectionState = 'IDLE' | 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED'

interface HarnessSettings {
  workspacePath: string
  workspaceProjects: WorkspaceManifestProject[]
  model: string
  permissionMode: HarnessPermissionMode
  approvalPolicy: HarnessApprovalPolicy
  thinkingLevel: HarnessThinkingLevel
  verificationMode: HarnessVerificationMode
}

type ExecutionSetting = 'model' | 'permissionMode' | 'approvalPolicy' | 'thinkingLevel'

const terminalStatuses = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])
const workspaceManifestStorageKey = 'harness.workspaceManifest.v1'
const safeProjectId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

interface RestoredWorkspaceProjects {
  projects: WorkspaceManifestProject[]
  error: string
}

function cloneWorkspaceProject(project: WorkspaceManifestProject): WorkspaceManifestProject {
  return {
    projectId: project.projectId,
    relativePath: project.relativePath,
    displayName: project.displayName,
    tags: [...project.tags],
  }
}

function restoreWorkspaceProjects(): RestoredWorkspaceProjects {
  const raw = globalThis.localStorage?.getItem(workspaceManifestStorageKey)
  if (!raw) return { projects: [], error: '' }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('配置不是对象')
    const record = parsed as Record<string, unknown>
    if (record.schemaVersion !== WORKSPACE_MANIFEST_SCHEMA_VERSION || !Array.isArray(record.projects)) {
      throw new Error('版本或项目列表无效')
    }
    if (record.projects.length > MAX_WORKSPACE_MANIFEST_PROJECTS) throw new Error('项目数量超过 32 个')
    const projects = record.projects.map((rawProject) => {
      if (typeof rawProject !== 'object' || rawProject === null) throw new Error('项目行无效')
      const project = rawProject as Record<string, unknown>
      if (typeof project.projectId !== 'string' || typeof project.relativePath !== 'string'
        || typeof project.displayName !== 'string' || !Array.isArray(project.tags)
        || project.tags.some((tag) => typeof tag !== 'string')) {
        throw new Error('项目字段无效')
      }
      return {
        projectId: project.projectId,
        relativePath: project.relativePath,
        displayName: project.displayName,
        tags: project.tags as string[],
      }
    })
    return { projects, error: '' }
  } catch {
    return { projects: [], error: '已忽略损坏或不兼容的本地 Workspace Manifest 配置' }
  }
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`Workspace Manifest 的${field}不能为空`)
  if (normalized.length > maxLength) throw new Error(`Workspace Manifest 的${field}不能超过 ${maxLength} 个字符`)
  return normalized
}

function normalizeWorkspaceManifest(
  projects: readonly WorkspaceManifestProject[],
): WorkspaceManifest | undefined {
  if (projects.length === 0) return undefined
  if (projects.length > MAX_WORKSPACE_MANIFEST_PROJECTS) {
    throw new Error(`Workspace Manifest 最多包含 ${MAX_WORKSPACE_MANIFEST_PROJECTS} 个项目`)
  }
  const projectIds = new Set<string>()
  const projectPaths = new Set<string>()
  const normalizedProjects = projects.map((project, index) => {
    const row = index + 1
    const projectId = requiredText(project.projectId, `第 ${row} 行项目 ID`, 64)
    if (!safeProjectId.test(projectId)) {
      throw new Error(`Workspace Manifest 第 ${row} 行项目 ID 只能包含字母、数字、点、下划线和连字符`)
    }
    const idIdentity = projectId.toLowerCase()
    if (!projectIds.add(idIdentity)) throw new Error(`Workspace Manifest 存在重复项目 ID：${projectId}`)

    const relativePath = requiredText(project.relativePath, `第 ${row} 行相对路径`, 512)
      .replaceAll('\\', '/')
    if (relativePath.startsWith('/') || /^[A-Za-z]:\//.test(relativePath)
      || relativePath.split('/').includes('..')) {
      throw new Error(`Workspace Manifest 第 ${row} 行必须使用 lease 内部相对路径，且不能包含 ..`)
    }
    const pathIdentity = relativePath.toLowerCase().replace(/\/$/, '') || '.'
    if (!projectPaths.add(pathIdentity)) throw new Error(`Workspace Manifest 存在重复项目路径：${relativePath}`)

    const displayName = requiredText(project.displayName, `第 ${row} 行显示名称`, 128)
    if (project.tags.length > 16) throw new Error(`Workspace Manifest 第 ${row} 行最多包含 16 个标签`)
    const tagIdentities = new Set<string>()
    const tags = project.tags.map((tag) => requiredText(tag, `第 ${row} 行标签`, 64))
    for (const tag of tags) {
      if (!tagIdentities.add(tag.toLowerCase())) {
        throw new Error(`Workspace Manifest 第 ${row} 行包含重复标签：${tag}`)
      }
    }
    tags.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    return { projectId, relativePath, displayName, tags }
  })
  return {
    schemaVersion: WORKSPACE_MANIFEST_SCHEMA_VERSION,
    projects: normalizedProjects,
  }
}

function modelAcceptsImages(model: string): boolean {
  return modelSupportsImages(model)
}

function messageText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function latestRun(runs: HarnessRunState[], preferredId: string | null): HarnessRunState | null {
  if (preferredId) {
    const preferred = runs.find((run) => run.runId === preferredId)
    if (preferred) return preferred
  }
  return [...runs].sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
}

async function readEventProjection(sessionId: string, runId: string) {
  let projection = emptyHarnessProjection()
  let cursor = 0
  while (true) {
    const page = await harnessApi.events(sessionId, runId, cursor, 10_000)
    projection = page.reduce(reduceHarnessEvent, projection)
    if (page.length < 10_000) return projection
    const next = page.at(-1)?.sequence ?? cursor
    if (next <= cursor) return projection
    cursor = next
  }
}

async function readRecentMessages(sessionId: string): Promise<HarnessMessage[]> {
  const visibleLimit = 2_000
  let result: HarnessMessage[] = []
  let cursor = 0
  while (true) {
    const page = await harnessApi.messages(sessionId, cursor, 10_000)
    result = [...result, ...page].slice(-visibleLimit)
    if (page.length < 10_000) return result
    const next = page.at(-1)?.sequence ?? cursor
    if (next <= cursor) return result
    cursor = next
  }
}

async function readMessagesAfter(sessionId: string, afterSequence: number): Promise<HarnessMessage[]> {
  const result: HarnessMessage[] = []
  let cursor = afterSequence
  while (true) {
    const page = await harnessApi.messages(sessionId, cursor, 10_000)
    result.push(...page)
    if (page.length < 10_000) return result
    const next = page.at(-1)?.sequence ?? cursor
    if (next <= cursor) return result
    cursor = next
  }
}

export function useHarnessAgent() {
  const restoredWorkspaceProjects = restoreWorkspaceProjects()
  const storedPermission = globalThis.localStorage?.getItem('harness.permission')
  const storedApproval = globalThis.localStorage?.getItem('harness.approval')
  const storedPermissionMode = (storedPermission as HarnessPermissionMode | null) ?? 'WORKSPACE_WRITE'
  const storedApprovalPolicy = (storedApproval as HarnessApprovalPolicy | null)
    ?? 'ON_REQUEST'
  const _sessions = shallowRef<HarnessSessionState[]>([])
  const _models = shallowRef<ModelOption[]>([])
  const _activeSession = shallowRef<HarnessSessionState | null>(null)
  const _activeRun = shallowRef<HarnessRunState | null>(null)
  const _messages = shallowRef<HarnessMessage[]>([])
  const _projection = shallowRef(emptyHarnessProjection())
  const _loading = shallowRef(false)
  const _submitting = shallowRef(false)
  const _sessionActionId = shallowRef<string | null>(null)
  const _sessionActionError = shallowRef('')
  const _lastDeletedSession = shallowRef<HarnessSessionState | null>(null)
  const _error = shallowRef(restoredWorkspaceProjects.error)
  const _connection = shallowRef<ConnectionState>('IDLE')
  const {
    shortcuts: _shortcuts,
    loading: shortcutsLoading,
    error: shortcutsError,
    refresh: refreshShortcuts,
    ensureLoaded: ensureShortcutsLoaded,
  } = useUrlShortcuts()
  const settings = reactive<HarnessSettings>({
    workspacePath: globalThis.localStorage?.getItem('harness.workspace') ?? '',
    workspaceProjects: restoredWorkspaceProjects.projects,
    model: globalThis.localStorage?.getItem('harness.model') ?? '',
    permissionMode: storedPermissionMode,
    approvalPolicy: storedApprovalPolicy,
    thinkingLevel: (globalThis.localStorage?.getItem('harness.thinkingLevel') as HarnessThinkingLevel | null)
      ?? DEFAULT_THINKING_LEVEL,
    verificationMode: (globalThis.localStorage?.getItem('harness.verificationMode') as HarnessVerificationMode | null)
      ?? 'AGENT',
  })

  let selectionRevision = 0
  let streamAbort: AbortController | null = null
  let pendingSessionCreate: { fingerprint: string; key: string } | null = null
  let pendingRunCreate: { fingerprint: string; key: string } | null = null
  const pendingQueuedInputs = new Map<string, string>()
  const pendingApprovalDecisions = new Map<string, { fingerprint: string; key: string }>()
  let pendingPlanFeedback: { fingerprint: string; key: string } | null = null

  const planIdentity = computed<PlanIdentity | null>(() => {
    const plan = _activeRun.value?.executionPlan
    if (!plan) return null
    if (typeof plan.canonicalHash === 'string' && /^[a-f0-9]{64}$/.test(plan.canonicalHash)) {
      return { taskId: plan.taskId, revision: plan.revision, hash: plan.canonicalHash }
    }
    const fromEvent = _projection.value.planIdentity
    return fromEvent?.taskId === plan.taskId && fromEvent.revision === plan.revision
      ? fromEvent : null
  })
  const pendingApprovals = computed(() => {
    const run = _activeRun.value
    if (!run) return []
    return Object.values(run.toolApprovals ?? {})
      .filter((approval) => approval.state === 'PENDING')
      .sort((left, right) => left.createdAt - right.createdAt)
  })
  const canCancel = computed(() => Boolean(_activeRun.value && !terminalStatuses.has(_activeRun.value.status)))
  const canResume = computed(() => _activeRun.value?.status === 'SUSPENDED')
  const sessionSettingsLocked = computed(() => Boolean(_activeSession.value))
  const canEditSessionDefaults = computed(() => !sessionSettingsLocked.value && !_submitting.value)
  const activeThinkingLevel = computed<HarnessThinkingLevel>(() =>
    _activeSession.value?.thinkingLevel ?? settings.thinkingLevel)
  const imageInputAllowed = computed(() => {
    const sessionModel = _activeSession.value?.model ?? settings.model
    return !_activeRun.value && modelAcceptsImages(sessionModel)
  })
  const imageInputHint = computed(() => {
    if (_activeRun.value) return '图片仅能随新任务的首条消息发送'
    const sessionModel = _activeSession.value?.model ?? settings.model
    if (!modelAcceptsImages(sessionModel)) return '当前固定模型不支持图片；请选择支持多模态的模型'
    if (isDoubaoModel(sessionModel)) return 'Doubao 支持图片输入，可选 low/high/xhigh 精度'
    return sessionModel === 'deepseek-auto'
      ? '图片将由服务端自动路由到视觉模型'
      : '当前视觉模型支持图片输入'
  })
  const workspaceManifestError = computed(() => {
    try {
      normalizeWorkspaceManifest(settings.workspaceProjects)
      return ''
    } catch (error) {
      return messageText(error)
    }
  })

  function rememberSettings(): void {
    globalThis.localStorage?.setItem('harness.workspace', settings.workspacePath)
    globalThis.localStorage?.setItem('harness.model', settings.model)
    globalThis.localStorage?.setItem('harness.permission', settings.permissionMode)
    globalThis.localStorage?.setItem('harness.approval', settings.approvalPolicy)
    globalThis.localStorage?.setItem('harness.thinkingLevel', settings.thinkingLevel)
    globalThis.localStorage?.setItem('harness.verificationMode', settings.verificationMode)
    globalThis.localStorage?.setItem(workspaceManifestStorageKey, JSON.stringify({
      schemaVersion: WORKSPACE_MANIFEST_SCHEMA_VERSION,
      projects: settings.workspaceProjects.map(cloneWorkspaceProject),
    }))
  }

  function guardSessionDefaults(): boolean {
    if (_activeSession.value) {
      setFailure(new Error('当前会话配置已锁定；请先点击“新建任务”再修改下一任务默认设置'))
      return false
    }
    if (_submitting.value) {
      setFailure(new Error('任务正在创建，暂时不能修改会话默认设置'))
      return false
    }
    return true
  }

  function setWorkspacePath(value: string): void {
    if (!guardSessionDefaults()) return
    settings.workspacePath = value
    rememberSettings()
  }

  function setVerificationMode(value: HarnessVerificationMode): void {
    if (!guardSessionDefaults()) return
    settings.verificationMode = value
    rememberSettings()
  }

  function setWorkspaceProjects(value: readonly WorkspaceManifestProject[]): void {
    if (!guardSessionDefaults()) return
    if (value.length > MAX_WORKSPACE_MANIFEST_PROJECTS) {
      setFailure(new Error(`Workspace Manifest 最多包含 ${MAX_WORKSPACE_MANIFEST_PROJECTS} 个项目`))
      return
    }
    settings.workspaceProjects = value.map(cloneWorkspaceProject)
    rememberSettings()
  }

  function updateExecutionSetting<K extends ExecutionSetting>(key: K, value: HarnessSettings[K]): void {
    if (_submitting.value || (_loading.value && _activeSession.value)) return
    const session = _activeSession.value
    const source: HarnessSettings = session ? {
      workspacePath: session.workspace,
      workspaceProjects: (session.workspaceManifest?.projects ?? []).map(cloneWorkspaceProject),
      model: session.model,
      permissionMode: session.permissionMode,
      approvalPolicy: session.approvalPolicy ?? 'ON_REQUEST',
      thinkingLevel: session.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
      verificationMode: session.verificationMode ?? 'AGENT',
    } : settings
    if (source[key] === value) return
    if (session) {
      // Menus explain this transition before selection. Existing session snapshots stay immutable.
      Object.assign(settings, source)
      newSession()
    }
    settings[key] = value
    rememberSettings()
  }

  function setModel(value: string): void {
    updateExecutionSetting('model', value)
  }

  function setPermissionMode(value: HarnessPermissionMode): void {
    updateExecutionSetting('permissionMode', value)
  }

  function setApprovalPolicy(value: HarnessApprovalPolicy): void {
    updateExecutionSetting('approvalPolicy', value)
  }

  function setThinkingLevel(value: HarnessThinkingLevel): void {
    updateExecutionSetting('thinkingLevel', value)
  }

  function stopStream(): void {
    streamAbort?.abort()
    streamAbort = null
    _connection.value = 'CLOSED'
  }

  function setFailure(error: unknown): void {
    _error.value = messageText(error)
  }

  function clearError(): void {
    _error.value = ''
  }

  function clearSessionActionError(): void {
    _sessionActionError.value = ''
  }

  async function changeSessionPin(sessionId: string, pinned: boolean): Promise<void> {
    if (_sessionActionId.value || _submitting.value) return
    _sessionActionId.value = sessionId
    clearSessionActionError()
    try {
      const updated = await harnessApi.pinSession(sessionId, pinned)
      _sessions.value = _sessions.value.map(session => session.sessionId === sessionId
        ? { ...session, pinnedAt: updated.pinnedAt } : session)
      if (_activeSession.value?.sessionId === sessionId) {
        _activeSession.value = { ..._activeSession.value, pinnedAt: updated.pinnedAt }
      }
    } catch (error) {
      _sessionActionError.value = messageText(error)
    } finally {
      _sessionActionId.value = null
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    if (_sessionActionId.value || _submitting.value) return
    const session = _sessions.value.find(item => item.sessionId === sessionId)
    if (!session) return
    _sessionActionId.value = sessionId
    clearSessionActionError()
    try {
      await harnessApi.deleteSession(sessionId)
      _sessions.value = _sessions.value.filter(item => item.sessionId !== sessionId)
      _lastDeletedSession.value = session
      if (_activeSession.value?.sessionId === sessionId) {
        newSession()
        _loading.value = false
      }
    } catch (error) {
      _sessionActionError.value = messageText(error)
    } finally {
      _sessionActionId.value = null
    }
  }

  async function undoSessionDelete(): Promise<void> {
    const deleted = _lastDeletedSession.value
    if (!deleted || _sessionActionId.value) return
    _sessionActionId.value = deleted.sessionId
    clearSessionActionError()
    try {
      const restored = await harnessApi.restoreSession(deleted.sessionId)
      _sessions.value = [restored, ..._sessions.value.filter(item => item.sessionId !== restored.sessionId)]
      _lastDeletedSession.value = null
    } catch (error) {
      _sessionActionError.value = messageText(error)
    } finally {
      _sessionActionId.value = null
    }
  }

  async function refreshMessages(sessionId: string, revision: number): Promise<void> {
    const cursor = _messages.value.at(-1)?.sequence ?? 0
    const messages = await readMessagesAfter(sessionId, cursor)
    if (selectionRevision !== revision || _activeSession.value?.sessionId !== sessionId) return
    if (messages.length) {
      _messages.value = [..._messages.value, ...messages].slice(-2_000)
    }
    _projection.value = acknowledgeStreamingTurn(_projection.value)
  }

  async function refreshRun(sessionId: string, runId: string, revision: number): Promise<void> {
    const run = await harnessApi.getRun(sessionId, runId)
    if (selectionRevision !== revision || _activeRun.value?.runId !== runId) return
    if (run.revision < _activeRun.value.revision) return
    _activeRun.value = run
    _sessions.value = _sessions.value.map((session) => session.sessionId === sessionId
      ? { ...session, activeRunId: runId, updatedAt: Math.max(session.updatedAt, run.updatedAt) }
      : session)
  }

  async function handleEvent(event: HarnessEvent, revision: number): Promise<void> {
    if (selectionRevision !== revision || _activeRun.value?.runId !== event.runId) return
    _projection.value = reduceHarnessEvent(_projection.value, event)
    const refreshRunTypes = event.type.startsWith('run.')
      || event.type.startsWith('approval.')
      || event.type.startsWith('plan.')
      || event.type === 'model.turn.started'
    const refreshMessageTypes = event.type === 'assistant.completed'
      || event.type === 'tool.completed'
      || event.type === 'input.queued'
      || event.type === 'run.completed'
      || event.type === 'run.failed'
      || event.type === 'run.cancelled'
    const operations: Promise<void>[] = []
    if (refreshRunTypes) operations.push(refreshRun(event.sessionId, event.runId, revision))
    if (refreshMessageTypes) operations.push(refreshMessages(event.sessionId, revision))
    if (operations.length) {
      await Promise.allSettled(operations)
    }
  }

  function connectStream(run: HarnessRunState, cursor: number, revision: number): void {
    stopStream()
    if (terminalStatuses.has(run.status)) {
      _connection.value = 'CLOSED'
      return
    }
    const controller = new AbortController()
    streamAbort = controller
    void streamHarnessEvents({
      sessionId: run.sessionId,
      runId: run.runId,
      afterSequence: cursor,
      signal: controller.signal,
      onConnectionChange(state) {
        if (selectionRevision === revision) _connection.value = state
      },
      onEvent: (event) => handleEvent(event, revision),
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (selectionRevision === revision) setFailure(error)
    })
  }

  async function activateRun(run: HarnessRunState, revision: number): Promise<void> {
    _activeRun.value = run
    const [messages, events] = await Promise.all([
      readRecentMessages(run.sessionId),
      readEventProjection(run.sessionId, run.runId),
    ])
    if (selectionRevision !== revision || _activeRun.value?.runId !== run.runId) return
    _messages.value = messages
    _projection.value = acknowledgeStreamingTurn(events)
    connectStream(run, _projection.value.lastSequence, revision)
  }

  async function selectSession(sessionId: string): Promise<void> {
    const revision = ++selectionRevision
    stopStream()
    _loading.value = true
    clearError()
    try {
      const session = _sessions.value.find((item) => item.sessionId === sessionId)
        ?? await harnessApi.getSession(sessionId)
      if (selectionRevision !== revision) return
      _activeSession.value = session
      _activeRun.value = null
      _messages.value = []
      _projection.value = emptyHarnessProjection()
      const runs = await harnessApi.listRuns(sessionId)
      if (selectionRevision !== revision) return
      const run = latestRun(runs, session.activeRunId)
      if (run) await activateRun(run, revision)
    } catch (error) {
      if (selectionRevision === revision) setFailure(error)
    } finally {
      if (selectionRevision === revision) _loading.value = false
    }
  }

  async function loadSessions(): Promise<void> {
    _loading.value = true
    clearError()
    try {
      const [sessions, models] = await Promise.allSettled([
        harnessApi.listSessions(),
        harnessApi.listModels(),
      ])
      if (sessions.status === 'rejected') throw sessions.reason
      _sessions.value = [...sessions.value].sort((left, right) => right.updatedAt - left.updatedAt)
      if (models.status === 'fulfilled') {
        _models.value = models.value
        const configuredModel = models.value.find((model) => model.name === settings.model)
        if (!configuredModel) {
          setModel(models.value.find((model) => model.name === 'deepseek-auto')?.name
            ?? models.value[0]?.name ?? '')
        }
      }
      const selectedId = _activeSession.value?.sessionId ?? _sessions.value[0]?.sessionId
      if (selectedId) await selectSession(selectedId)
    } catch (error) {
      setFailure(error)
    } finally {
      _loading.value = false
    }
  }

  async function createSession(title = '新编程任务'): Promise<HarnessSessionState> {
    const model = settings.model.trim()
    if (!model) throw new Error('请先选择或填写模型')
    const workspaceManifest = normalizeWorkspaceManifest(settings.workspaceProjects)
    const fingerprint = JSON.stringify({
      workspacePath: settings.workspacePath.trim(), model,
      workspaceManifest,
      permissionMode: settings.permissionMode, approvalPolicy: settings.approvalPolicy,
      thinkingLevel: isDoubaoModel(model) ? settings.thinkingLevel : undefined,
      verificationMode: settings.verificationMode, title,
    })
    if (pendingSessionCreate?.fingerprint !== fingerprint) {
      pendingSessionCreate = { fingerprint, key: createId('session-create') }
    }
    const session = await harnessApi.createSession({
      workspacePath: settings.workspacePath.trim() || undefined,
      workspaceManifest,
      model,
      permissionMode: settings.permissionMode,
      approvalPolicy: settings.approvalPolicy,
      thinkingLevel: isDoubaoModel(model) ? settings.thinkingLevel : undefined,
      verificationMode: settings.verificationMode,
      title,
      idempotencyKey: pendingSessionCreate.key,
    })
    pendingSessionCreate = null
    _sessions.value = [session, ..._sessions.value.filter((item) => item.sessionId !== session.sessionId)]
    ++selectionRevision
    stopStream()
    _activeSession.value = session
    _activeRun.value = null
    _messages.value = []
    _projection.value = emptyHarnessProjection()
    return session
  }

  function newSession(): void {
    // 新建编程任务（含已处于空白会话时再次点击）：始终以可见 loading/错误态重新拉取后台最新快捷链接，
    // 失败时由 UrlShortcutCards 的错误分支提供重试入口，与首次加载、手动重试保持一致。
    void refreshShortcuts()
    ++selectionRevision
    stopStream()
    clearError()
    pendingSessionCreate = null
    pendingRunCreate = null
    _activeSession.value = null
    _activeRun.value = null
    _messages.value = []
    _projection.value = emptyHarnessProjection()
  }

  // 快捷链接加载失败后的重试入口：以非静默方式重新拉取，展示 loading 与错误态，
  // 与首次加载、新建任务刷新保持一致。
  async function retryShortcuts(): Promise<void> {
    await refreshShortcuts()
  }

  async function submit(
    content: string,
    images: readonly PendingImageAttachment[] = [],
    files: readonly TextAttachment[] = [],
  ): Promise<boolean> {
    let requirement = content.trim()
    if (!requirement || _submitting.value) return false
    _submitting.value = true
    clearError()
    try {
      if (requirement.length > 200_000) {
        throw new Error('消息与文本附件合计不能超过 200,000 个字符，请缩短内容或移除部分附件')
      }
      if ([...images, ...files].reduce((sum, file) => sum + file.byteSize, 0) > 50 * 1024 * 1024) {
        throw new Error('图片和附件合计不能超过 50 MB')
      }
      const requestedModel = _activeSession.value?.model ?? settings.model.trim()
      if (images.length && !modelAcceptsImages(requestedModel)) {
        throw new Error('当前固定模型不支持图片；请新建任务并选择支持多模态的模型（如 Doubao 或视觉模型）')
      }
      const session = _activeSession.value ?? await createSession(requirement.slice(0, 80))
      if (files.length) {
        const uploaded = await harnessApi.uploadAttachments(files.map(file => file.file))
        requirement += `\n\n参考附件：\n${JSON.stringify(uploaded.map(file => ({ name: file.fileName, url: file.url, ossId: file.ossId })))}`
      }
      if (images.length && !modelAcceptsImages(session.model)) {
        throw new Error('当前固定模型不支持图片；请新建任务并选择支持多模态的模型（如 Doubao 或视觉模型）')
      }
      const currentRun = _activeRun.value
      if (images.length && currentRun) {
        throw new Error('图片仅能随新任务发送，请点击“新建任务”后重试')
      }
      let run: HarnessRunState
      if (!currentRun) {
        const fingerprint = JSON.stringify({
          sessionId: session.sessionId,
          requirement,
          imageIds: images.map((image) => image.id),
        })
        if (pendingRunCreate?.fingerprint !== fingerprint) {
          pendingRunCreate = { fingerprint, key: createId('run-create') }
        }
        const defaultDetail: HarnessImageDetail = isDoubaoModel(session.model)
          ? DEFAULT_DOUBAO_IMAGE_DETAIL : 'auto'
        run = await harnessApi.createRun(session.sessionId, {
          requirement,
          images: images.map(({ dataUrl, detail }) => ({
            dataUrl,
            // Doubao 使用 low/high/xhigh（默认 high）；DeepSeek 保持 auto/low/original。
            detail: detail === 'auto' || detail === 'original' ? defaultDetail : detail,
          })),
          idempotencyKey: pendingRunCreate.key,
        })
        pendingRunCreate = null
      } else {
        const kind: Exclude<HarnessInputKind, 'INITIAL'> = terminalStatuses.has(currentRun.status)
          ? 'FOLLOW_UP'
          : 'STEER'
        const fingerprint = JSON.stringify({
          sessionId: session.sessionId,
          runId: currentRun.runId,
          kind,
          content: requirement,
        })
        let idempotencyKey = pendingQueuedInputs.get(fingerprint)
        if (!idempotencyKey) {
          idempotencyKey = createId('queued-input')
          pendingQueuedInputs.set(fingerprint, idempotencyKey)
        }
        run = await harnessApi.queueInput(session.sessionId, currentRun.runId, {
          kind,
          content: requirement,
          idempotencyKey,
        })
        pendingQueuedInputs.delete(fingerprint)
      }
      if (currentRun && run.runId === currentRun.runId) {
        _activeRun.value = run
        await refreshMessages(run.sessionId, selectionRevision)
      } else {
        const revision = ++selectionRevision
        await activateRun(run, revision)
      }
      return true
    } catch (error) {
      setFailure(error)
      return false
    } finally {
      _submitting.value = false
    }
  }

  async function cancel(): Promise<void> {
    const run = _activeRun.value
    if (!run) return
    try {
      _activeRun.value = await harnessApi.cancel(run.sessionId, run.runId)
    } catch (error) {
      setFailure(error)
    }
  }

  async function resume(): Promise<void> {
    const run = _activeRun.value
    if (!run) return
    try {
      const resumed = await harnessApi.resume(run.sessionId, run.runId)
      _activeRun.value = resumed
      connectStream(resumed, _projection.value.lastSequence, selectionRevision)
    } catch (error) {
      setFailure(error)
    }
  }

  async function resolveApproval(
    approvalId: string,
    decision: ApprovalDecision,
    note?: string,
  ): Promise<void> {
    const run = _activeRun.value
    const approval = run?.toolApprovals?.[approvalId]
    if (!run || !approval) return
    const normalizedNote = note?.trim() || undefined
    const fingerprint = JSON.stringify({
      approvalId,
      decision,
      note: normalizedNote ?? null,
      revision: approval.revision,
      argumentsSha256: approval.argumentsSha256,
    })
    let intent = pendingApprovalDecisions.get(approvalId)
    if (intent?.fingerprint !== fingerprint) {
      intent = { fingerprint, key: createId('decision') }
      pendingApprovalDecisions.set(approvalId, intent)
    }
    try {
      _activeRun.value = await harnessApi.resolveApproval(run.sessionId, run.runId, approvalId, {
        decisionId: intent.key,
        decision,
        expectedRevision: approval.revision,
        argumentsSha256: approval.argumentsSha256,
        note: normalizedNote,
      })
      pendingApprovalDecisions.delete(approvalId)
    } catch (error) {
      setFailure(error)
    }
  }

  function requirePlanIdentity(): PlanIdentity {
    const plan = planIdentity.value
    if (!plan) throw new Error('尚未收到可审批计划的 revision/hash，请等待事件同步')
    return plan
  }

  async function approvePlan(): Promise<void> {
    const run = _activeRun.value
    if (!run) return
    try {
      const plan = requirePlanIdentity()
      const idempotencyKey = `approve:${plan.taskId}:${plan.revision}:${plan.hash}`
      const approved = await harnessApi.approvePlan(
        run.sessionId,
        run.runId,
        plan,
        idempotencyKey,
      )
      _activeRun.value = approved
      connectStream(approved, _projection.value.lastSequence, selectionRevision)
    } catch (error) {
      setFailure(error)
    }
  }

  async function requestPlanRevision(content: string): Promise<void> {
    const run = _activeRun.value
    const feedback = content.trim()
    if (!run || !feedback) return
    try {
      const plan = requirePlanIdentity()
      const fingerprint = JSON.stringify({ plan, content: feedback })
      if (pendingPlanFeedback?.fingerprint !== fingerprint) {
        pendingPlanFeedback = { fingerprint, key: createId('feedback') }
      }
      _activeRun.value = await harnessApi.requestPlanRevision(
        run.sessionId,
        run.runId,
        plan,
        pendingPlanFeedback.key,
        feedback,
      )
      pendingPlanFeedback = null
    } catch (error) {
      setFailure(error)
    }
  }

  void ensureShortcutsLoaded()

  onScopeDispose(stopStream)

  return {
    sessions: readonly(_sessions),
    models: readonly(_models),
    activeSession: readonly(_activeSession),
    activeRun: readonly(_activeRun),
    messages: readonly(_messages),
    projection: readonly(_projection),
    settings: readonly(settings),
    loading: readonly(_loading),
    submitting: readonly(_submitting),
    sessionActionId: readonly(_sessionActionId),
    sessionActionError: readonly(_sessionActionError),
    lastDeletedSession: readonly(_lastDeletedSession),
    changeSessionPin,
    deleteSession,
    undoSessionDelete,
    clearSessionActionError,
    dismissDeletedSession: () => { _lastDeletedSession.value = null },
    error: readonly(_error),
    connection: readonly(_connection),
    shortcuts: _shortcuts,
    shortcutsLoading,
    shortcutsError,
    refreshShortcuts,
    retryShortcuts,
    planIdentity,
    pendingApprovals,
    canCancel,
    canResume,
    sessionSettingsLocked,
    canEditSessionDefaults,
    imageInputAllowed,
    imageInputHint,
    workspaceManifestError,
    loadSessions,
    selectSession,
    newSession,
    submit,
    cancel,
    resume,
    resolveApproval,
    approvePlan,
    requestPlanRevision,
    setWorkspacePath,
    setVerificationMode,
    setWorkspaceProjects,
    setModel,
    setPermissionMode,
    setApprovalPolicy,
    setThinkingLevel,
    activeThinkingLevel,
    clearError,
  }
}
