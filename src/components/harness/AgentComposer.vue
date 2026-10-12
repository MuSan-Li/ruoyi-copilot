<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue'
import AppIcon from '../AppIcon.vue'
import ContextPicker from './ContextPicker.vue'
import PermissionModePicker from './PermissionModePicker.vue'
import ApprovalPolicyPicker from './ApprovalPolicyPicker.vue'
import ModelPicker from './ModelPicker.vue'
import ImageAttachmentPicker from './ImageAttachmentPicker.vue'
import type { TextAttachment } from '../../composables/useFileAttachments'
import ThinkingLevelPicker from './ThinkingLevelPicker.vue'
import { isDoubaoModel } from '../../utils/modelCapabilities'
import type {
  HarnessApprovalPolicy,
  HarnessImageDetail,
  HarnessPermissionMode,
  HarnessRunStatus,
  HarnessThinkingLevel,
  ModelOption,
  PendingImageAttachment,
  WorkspaceManifest,
  WorkspaceManifestProject,
} from '../../types/harness'

interface Props {
  models: readonly ModelOption[]
  model: string
  workspacePath: string
  workspaceProjects: readonly WorkspaceManifestProject[]
  permissionMode: HarnessPermissionMode
  approvalPolicy: HarnessApprovalPolicy
  activeModel?: string | null
  activeWorkspacePath?: string | null
  activeWorkspaceManifest?: WorkspaceManifest | null
  activePermissionMode?: HarnessPermissionMode | null
  activeApprovalPolicy?: HarnessApprovalPolicy | null
  thinkingLevel: HarnessThinkingLevel
  workspaceManifestError?: string
  settingsLocked: boolean
  loading?: boolean
  runStatus: HarnessRunStatus | null
  submitting: boolean
  canCancel: boolean
  canResume: boolean
  imageInputAllowed: boolean
  imageInputHint: string
  attachments: readonly PendingImageAttachment[]
  files: readonly TextAttachment[]
  attachmentsReading: boolean
  attachmentError?: string
}

interface Emits {
  'update:model': [value: string]
  'update:workspacePath': [value: string]
  'update:workspaceProjects': [value: readonly WorkspaceManifestProject[]]
  'update:permissionMode': [value: HarnessPermissionMode]
  'update:approvalPolicy': [value: HarnessApprovalPolicy]
  'update:thinkingLevel': [value: HarnessThinkingLevel]
  'add-images': [files: readonly File[]]
  'add-files': [files: readonly File[]]
  'remove-file': [id: string]
  'remove-image': [id: string]
  'update-image-detail': [id: string, detail: HarnessImageDetail]
  submit: [content: string]
  cancel: []
  resume: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const draft = shallowRef('')
const settingsOpen = shallowRef(false)
const footer = useTemplateRef<HTMLElement>('footer')
const composer = useTemplateRef<HTMLTextAreaElement>('composer')
const effectivePermissionMode = computed(() => props.activePermissionMode ?? props.permissionMode)
const effectiveApprovalPolicy = computed(() => props.activeApprovalPolicy ?? props.approvalPolicy)
// 设置面板未锁定时用待建会话配置；已固定时按会话模型判断是否为 Doubao。
const settingsModel = computed(() => props.activeModel ?? props.model)
const doubaoModel = computed(() => isDoubaoModel(settingsModel.value))
const settingsBusy = computed(() => props.submitting || props.loading)
const settingChangeNotice = computed(() => props.settingsLocked
  ? '选择不同配置将新建任务，原会话记录保留。' : undefined)

const placeholder = computed(() => {
  if (!props.runStatus) return '描述任务，或添加图片、附件作为参考…'
  if (props.runStatus === 'RUNNING' || props.runStatus === 'QUEUED') return '补充要求，调整当前任务…'
  if (props.runStatus === 'WAITING_FOR_APPROVAL') return '可补充说明，或先处理上方工具审批…'
  if (props.runStatus === 'WAITING_FOR_INPUT') return '补充信息，或在计划卡片中批准/要求修改…'
  if (props.runStatus === 'SUSPENDED') return '运行已挂起，可先恢复，或描述新的后续任务…'
  return '继续这个会话，描述接下来的任务…'
})

function submit(): void {
  const content = draft.value.trim()
  if ((!content && !props.files.length && !props.attachments.length) || props.submitting || props.attachmentsReading) return
  emit('submit', content || '请分析所附资料。')
  void nextTick(() => composer.value?.focus())
}

defineExpose({ clearDraft: () => { draft.value = '' } })

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function dismissSettings(event: PointerEvent): void {
  const target = event.target as Element | null
  if (target && !footer.value?.contains(target) && !target.closest('.composer-select-menu')) settingsOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', dismissSettings))
onUnmounted(() => document.removeEventListener('pointerdown', dismissSettings))
</script>

<template>
  <footer ref="footer" class="composer-wrap" @keydown.esc="settingsOpen = false">
    <div v-show="settingsOpen" class="composer-settings composer-settings--compact" role="dialog" aria-label="会话设置">
      <div class="composer-settings-heading">
        <div><strong>会话设置</strong><p>{{ settingsLocked ? '当前会话的固定配置' : '设置工作区与执行方式' }}</p></div>
        <button class="tool-button" type="button" aria-label="关闭会话设置" @click="settingsOpen = false"><AppIcon name="x" :size="15" /></button>
      </div>
      <ContextPicker
        :workspace-path="workspacePath"
        :projects="workspaceProjects"
        :active-workspace-path="activeWorkspacePath"
        :active-manifest="activeWorkspaceManifest"
        :error="workspaceManifestError"
        :disabled="settingsLocked || settingsBusy"
        @update="emit('update:workspacePath', $event)"
        @update:projects="emit('update:workspaceProjects', $event)"
      />
      <div class="composer-settings-rows">
      <div class="composer-setting-row"><div><strong>审批策略</strong><p>执行操作前是否需要确认</p></div>
      <ApprovalPolicyPicker
        :value="effectiveApprovalPolicy"
        :disabled="settingsBusy"
        :notice="settingChangeNotice"
        @update="emit('update:approvalPolicy', $event)"
      />
      </div>
      </div>
    </div>

    <div class="composer">
      <textarea
        ref="composer"
        v-model="draft"
        rows="2"
        :placeholder="placeholder"
        :disabled="submitting"
        @keydown="onKeydown"
      />
      <div class="composer-toolbar">
        <div class="composer-options">
          <ImageAttachmentPicker
            :attachments="attachments"
            :files="files"
            :image-allowed="imageInputAllowed"
            :model="settingsModel"
            :error="attachmentError"
            :disabled="submitting || attachmentsReading"
            :disabled-reason="imageInputHint"
            @add="emit('add-images', $event)"
            @add-files="emit('add-files', $event)"
            @remove-file="emit('remove-file', $event)"
            @remove="emit('remove-image', $event)"
            @update:detail="(id, detail) => emit('update-image-detail', id, detail)"
          />
          <button
            class="tool-button"
            type="button"
            :class="{ active: settingsOpen }"
            title="会话设置"
            :aria-expanded="settingsOpen"
            @click="settingsOpen = !settingsOpen"
          >
            <AppIcon name="settings" :size="16" />
          </button>
          <PermissionModePicker
            :value="effectivePermissionMode" :disabled="settingsBusy" :notice="settingChangeNotice"
            @update="emit('update:permissionMode', $event)" />
        </div>
        <div class="composer-actions">
          <div class="composer-model-controls">
            <ModelPicker :value="settingsModel" :models="models" :disabled="settingsBusy"
              :notice="settingChangeNotice" @update="emit('update:model', $event)" />
            <ThinkingLevelPicker v-if="doubaoModel" :value="thinkingLevel" :disabled="settingsBusy" :notice="settingChangeNotice"
              @update="emit('update:thinkingLevel', $event)" />
          </div>
          <button v-if="canResume" class="button" type="button" @click="emit('resume')">恢复运行</button>
          <button v-if="canCancel" class="stop-button" type="button" aria-label="取消运行" @click="emit('cancel')">
            <AppIcon name="x" :size="14" />
          </button>
          <button class="send-button" type="button" :disabled="(!draft.trim() && !files.length && !attachments.length) || submitting || attachmentsReading" aria-label="发送" @click="submit">
            <span v-if="submitting" class="spinner" />
            <AppIcon v-else name="send" :size="17" :stroke-width="2.2" />
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.composer-settings--compact { display: flex; flex-direction: column; gap: 18px; padding: 20px; max-height: min(70vh, 620px); border-radius: 16px; }
.composer-settings-heading { display: flex; justify-content: space-between; align-items: flex-start; }
.composer-settings-heading strong { font-size: 14px; font-weight: 600; color: var(--color-text); }
.composer-settings-heading p { margin: 4px 0 0; color: var(--color-text-muted); font-size: 11px; }
.composer-settings-rows { border-top: 1px solid var(--color-border); }
.composer-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 0 0; }
.composer-setting-row strong { font-size: 12px; font-weight: 500; color: var(--color-text-secondary); }
.composer-setting-row p { margin: 4px 0 0; font-size: 11px; color: var(--color-text-muted); }
.composer-model-controls { display: flex; align-items: center; min-width: 0; gap: 0; }
.composer { padding: 15px 12px 11px; border-radius: 20px; box-shadow: 0 4px 22px rgba(35, 57, 75, 0.025); }
.composer textarea { min-height: 60px; padding: 0 4px; font-size: 14px; }
.composer:focus-within { border-color: var(--color-focus); box-shadow: 0 4px 24px rgba(35, 57, 75, 0.04); }
.composer-toolbar { gap: 10px; }
.composer-actions { gap: 10px; min-width: 0; }
.send-button, .stop-button { width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; }
@media(max-width: 640px) {
  .composer { padding: 12px 8px 9px; }
  .composer-toolbar { flex-wrap: wrap; gap: 4px; }
  .composer-actions { width: 100%; justify-content: flex-end; gap: 5px; }
  .composer-model-controls { margin-right: auto; }
  .composer-settings--compact { width: calc(100% - 20px); padding: 16px; max-height: 66vh; gap: 14px; }
}
</style>
