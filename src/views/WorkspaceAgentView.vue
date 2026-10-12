<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import SessionSidebar from '../components/harness/SessionSidebar.vue'
import ConversationTimeline from '../components/harness/ConversationTimeline.vue'
import AgentComposer from '../components/harness/AgentComposer.vue'
import TaskPlanDrawer from '../components/harness/TaskPlanDrawer.vue'
import AppIcon from '../components/AppIcon.vue'
import { useHarnessAgent } from '../composables/useHarnessAgent'
import { useImageAttachments } from '../composables/useImageAttachments'
import { useFileAttachments } from '../composables/useFileAttachments'
import {
  DEFAULT_DOUBAO_IMAGE_DETAIL,
  isDoubaoModel,
} from '../utils/modelCapabilities'

interface Props {
  userName: string
}

defineProps<Props>()
const emit = defineEmits<{ logout: [] }>()

const agent = useHarnessAgent()
const composer = useTemplateRef<InstanceType<typeof AgentComposer>>('agentComposer')
const images = useImageAttachments()
const files = useFileAttachments()
const attachmentLimitError = shallowRef('')
function canAddAttachments(additions: readonly File[]): boolean {
  attachmentLimitError.value = ''
  const total = [...files.attachments.value, ...images.attachments.value].reduce((sum, item) => sum + item.byteSize, 0)
    + additions.reduce((sum, file) => sum + file.size, 0)
  if (total > 50 * 1024 * 1024) {
    attachmentLimitError.value = '图片和附件合计不能超过 50 MB'
    return false
  }
  return true
}
function addFiles(additions: readonly File[]): void {
  if (canAddAttachments(additions)) void files.addFiles(additions)
}
const sidebarCollapsed = shallowRef(false)
const mobileSidebarOpen = shallowRef(false)
const planInspectorOpen = shallowRef(false)

const title = computed(() => agent.activeSession.value?.title || '新编程任务')
const workspaceLabel = computed(() => agent.activeSession.value?.workspace
  || agent.settings.workspacePath
  || '默认工作区')
const activePlan = computed(() => agent.activeRun.value?.executionPlan ?? null)
const completedPlanSteps = computed(() => activePlan.value?.steps.filter((step) =>
  step.status === 'COMPLETED' || step.status === 'SKIPPED').length ?? 0)
const pendingPlanApprovalKey = computed(() => {
  const plan = activePlan.value
  return plan?.mode === 'PLAN' && plan.reviewState === 'AWAITING_APPROVAL'
    ? `${plan.taskId}:${plan.revision}`
    : null
})
const planNeedsReview = computed(() => pendingPlanApprovalKey.value !== null)

watch(
  pendingPlanApprovalKey,
  (key, previousKey) => {
    if (key && key !== previousKey) planInspectorOpen.value = true
  },
  { immediate: true },
)
async function submit(content: string): Promise<void> {
  if (files.reading.value || images.reading.value) return
  const submitted = await agent.submit(content, images.attachments.value, files.attachments.value)
  if (submitted) { images.clear(); files.clear(); composer.value?.clearDraft(); attachmentLimitError.value = '' }
}

function addImages(files: readonly File[]): void {
  if (!canAddAttachments(files)) return
  const model = agent.activeSession.value?.model ?? agent.settings.model
  const detail = isDoubaoModel(model) ? DEFAULT_DOUBAO_IMAGE_DETAIL : 'auto'
  void images.addFiles(files, detail)
}

function setImageDetail(id: string, detail: 'low' | 'high' | 'xhigh' | 'auto' | 'original'): void {
  images.setDetail(id, detail)
}

function collapseSidebar(): void {
  sidebarCollapsed.value = true
  mobileSidebarOpen.value = false
}

function openSidebar(): void {
  sidebarCollapsed.value = false
  mobileSidebarOpen.value = true
}

onMounted(() => {
  void agent.loadSessions()
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--sidebar-collapsed': sidebarCollapsed }">
    <button
      v-if="mobileSidebarOpen"
      class="sidebar-scrim"
      aria-label="关闭会话侧栏"
      @click="mobileSidebarOpen = false"
    />
    <SessionSidebar
      :sessions="agent.sessions.value"
      :active-session-id="agent.activeSession.value?.sessionId ?? null"
      :loading="agent.loading.value"
      :open="mobileSidebarOpen"
      :user-name="userName"
      :busy="agent.submitting.value"
      :action-id="agent.sessionActionId.value"
      :action-error="agent.sessionActionError.value"
      @pin="agent.changeSessionPin"
      @delete="agent.deleteSession"
      @clear-action-error="agent.clearSessionActionError"
      @collapse="collapseSidebar"
      @close="mobileSidebarOpen = false"
      @new-session="agent.newSession"
      @select="agent.selectSession"
      @logout="emit('logout')"
    />

    <main class="main-panel">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-button mobile-menu" aria-label="展开会话侧栏" @click="openSidebar">
            <AppIcon name="panel" :size="18" />
          </button>
          <div class="title-stack">
            <strong>{{ title }}</strong>
            <span><AppIcon name="folder" :size="12" /> {{ workspaceLabel }}</span>
          </div>
        </div>
        <div v-if="agent.activeSession.value && activePlan" class="topbar-actions">
          <button
            v-if="activePlan"
            class="task-preview-trigger"
            :class="{ 'task-preview-trigger--attention': planNeedsReview }"
            type="button"
            aria-controls="task-plan-inspector"
            :aria-expanded="planInspectorOpen"
            @click="planInspectorOpen = !planInspectorOpen"
          >
            <AppIcon name="branch" :size="15" />
            <span>{{ planNeedsReview ? '计划待审批' : '任务计划' }}</span>
            <small>{{ completedPlanSteps }}/{{ activePlan.steps.length }}</small>
          </button>
        </div>
      </header>

      <div class="workspace-stage">
        <div class="conversation-column">
          <div v-if="agent.error.value" class="error-banner" role="alert">
            <span>{{ agent.error.value }}</span>
            <button type="button" @click="agent.clearError">关闭</button>
          </div>

          <ConversationTimeline
            :messages="agent.messages.value"
            :run="agent.activeRun.value"
            :projection="agent.projection.value"
            :loading="agent.loading.value"
            :connection="agent.connection.value"
            :pending-approvals="agent.pendingApprovals.value"
            :shortcuts="agent.shortcuts.value"
            :shortcuts-loading="agent.shortcutsLoading.value"
            :shortcuts-error="agent.shortcutsError.value"
            @resolve-approval="agent.resolveApproval"
            @retry-shortcuts="agent.retryShortcuts"
          />

          <AgentComposer
            ref="agentComposer"
            :models="agent.models.value"
            :model="agent.settings.model"
            :workspace-path="agent.settings.workspacePath"
            :workspace-projects="agent.settings.workspaceProjects"
            :permission-mode="agent.settings.permissionMode"
            :approval-policy="agent.settings.approvalPolicy"
            :active-model="agent.activeSession.value?.model ?? null"
            :active-workspace-path="agent.activeSession.value?.workspace ?? null"
            :active-workspace-manifest="agent.activeSession.value?.workspaceManifest ?? null"
            :active-permission-mode="agent.activeSession.value?.permissionMode ?? null"
            :active-approval-policy="agent.activeSession.value
              ? (agent.activeSession.value.approvalPolicy ?? 'ON_REQUEST')
              : null"
            :thinking-level="agent.activeThinkingLevel.value"
            :settings-locked="agent.sessionSettingsLocked.value"
            :loading="agent.loading.value"
            :run-status="agent.activeRun.value?.status ?? null"
            :submitting="agent.submitting.value"
            :can-cancel="agent.canCancel.value"
            :can-resume="agent.canResume.value"
            :image-input-allowed="agent.imageInputAllowed.value"
            :image-input-hint="agent.imageInputHint.value"
            :workspace-manifest-error="agent.workspaceManifestError.value"
            :attachments="images.attachments.value"
            :files="files.attachments.value"
            :attachments-reading="files.reading.value || images.reading.value"
            :attachment-error="[attachmentLimitError, images.error.value, files.error.value].filter(Boolean).join('；')"
            @update:model="agent.setModel"
            @update:workspace-path="agent.setWorkspacePath"
            @update:workspace-projects="agent.setWorkspaceProjects"
            @update:permission-mode="agent.setPermissionMode"
            @update:approval-policy="agent.setApprovalPolicy"
            @update:thinking-level="agent.setThinkingLevel"
            @add-images="addImages"
            @add-files="addFiles"
            @remove-file="files.remove"
            @remove-image="images.remove"
            @update-image-detail="setImageDetail"
            @submit="submit"
            @cancel="agent.cancel"
            @resume="agent.resume"
          />
        </div>

        <TaskPlanDrawer
          v-if="activePlan"
          v-show="planInspectorOpen"
          :plan="activePlan"
          :identity="agent.planIdentity.value"
          :attention-key="pendingPlanApprovalKey"
          @close="planInspectorOpen = false"
          @approve="agent.approvePlan"
          @request-revision="agent.requestPlanRevision"
        />
      </div>
    </main>

    <div v-if="agent.lastDeletedSession.value" class="session-toast" role="status">
      <AppIcon name="check" :size="16" />
      <span>会话已删除</span>
      <button type="button" :disabled="!!agent.sessionActionId.value" @click="agent.undoSessionDelete">撤销</button>
      <button class="icon-button" type="button" aria-label="关闭删除提示" @click="agent.dismissDeletedSession">
        <AppIcon name="x" :size="14" />
      </button>
    </div>
  </div>
</template>
