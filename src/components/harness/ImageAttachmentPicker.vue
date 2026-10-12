<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue'
import type { TextAttachment } from '../../composables/useFileAttachments'
import AppIcon from '../AppIcon.vue'
import {
  DOUBAO_IMAGE_DETAIL_OPTIONS,
  isDoubaoModel,
} from '../../utils/modelCapabilities'
import type { HarnessImageDetail, PendingImageAttachment } from '../../types/harness'

interface Props {
  attachments: readonly PendingImageAttachment[]
  files: readonly TextAttachment[]
  imageAllowed: boolean
  model?: string | null
  disabled?: boolean
  disabledReason?: string
  error?: string
}

interface Emits {
  add: [files: readonly File[]]
  addFiles: [files: readonly File[]]
  removeFile: [id: string]
  remove: [id: string]
  'update:detail': [id: string, detail: HarnessImageDetail]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const input = useTemplateRef<HTMLInputElement>('input')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const picker = useTemplateRef<HTMLElement>('picker')
const open = shallowRef(false)
function dismiss(event: PointerEvent): void {
  if (!picker.value?.contains(event.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', dismiss))
onUnmounted(() => document.removeEventListener('pointerdown', dismiss))
function selectFiles(event: Event): void {
  const target = event.target as HTMLInputElement
  if (target.files?.length) emit('addFiles', [...target.files])
  target.value = ''
}

const doubao = computed(() => isDoubaoModel(props.model))

function select(event: Event): void {
  const target = event.target as HTMLInputElement
  if (target.files?.length) emit('add', [...target.files])
  target.value = ''
}

function detailValue(detail: HarnessImageDetail): HarnessImageDetail {
  // DeepSeek 旧语义 auto/original 在 Doubao 下归一化为 high（不静默降为 low）。
  return detail === 'auto' || detail === 'original' ? 'high' : detail
}

function onDetail(id: string, event: Event): void {
  emit('update:detail', id, (event.target as HTMLSelectElement).value as HarnessImageDetail)
}
</script>

<template>
  <div ref="picker" class="image-attachments" @keydown.esc="open = false">
    <div v-if="attachments.length || files.length" class="image-preview-list" aria-label="待发送附件">
      <figure v-for="file in files" :key="file.id" class="image-preview file-preview">
        <AppIcon name="file" :size="26" />
        <figcaption :title="file.name">{{ file.name }}</figcaption>
        <small>{{ Math.max(1, Math.ceil(file.byteSize / 1024)) }} KiB</small>
        <button type="button" :aria-label="`移除 ${file.name}`" :disabled="disabled" @click="emit('removeFile', file.id)"><AppIcon name="x" :size="12" /></button>
      </figure>
      <figure v-for="image in attachments" :key="image.id" class="image-preview">
        <img :src="image.dataUrl" :alt="image.name" />
        <figcaption>{{ image.name }}</figcaption>
        <label v-if="doubao" class="image-detail-select" title="图片理解精细度">
          <select
            :value="detailValue(image.detail)"
            :disabled="disabled"
            aria-label="图片精度"
            @change="onDetail(image.id, $event)"
          >
            <option v-for="option in DOUBAO_IMAGE_DETAIL_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <button
          type="button"
          :aria-label="`移除 ${image.name}`"
          :disabled="disabled"
          @click="emit('remove', image.id)"
        >
          <AppIcon name="x" :size="12" />
        </button>
      </figure>
    </div>
    <p v-if="error" class="image-error" role="alert">{{ error }}</p>
    <input
      ref="input"
      class="visually-hidden"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      multiple
      :disabled="disabled || !imageAllowed"
      @change="select"
    />
    <input ref="fileInput" class="visually-hidden" type="file" multiple :disabled="disabled" @change="selectFiles" />
    <div class="attachment-trigger">
    <div v-if="open" class="attachment-menu" aria-label="添加附件">
      <button type="button" :disabled="disabled || !imageAllowed || attachments.length >= 5" :title="disabledReason" @click="open = false; input?.click()">
        <AppIcon name="image" :size="16" /><span>上传图片<small>{{ imageAllowed ? 'JPEG、PNG、GIF、WebP' : disabledReason }}</small></span>
      </button>
      <button type="button" :disabled="disabled || files.length >= 5" @click="open = false; fileInput?.click()">
        <AppIcon name="file" :size="16" /><span>上传附件<small>文档、表格、代码及其他文件</small></span>
      </button>
      <p>单个文件 ≤ 10 MB，合计 ≤ 50 MB</p>
    </div>
    <button
      class="tool-button"
      type="button"
      title="添加图片或附件"
      aria-label="添加图片或附件"
      :aria-expanded="open"
      :disabled="disabled"
      @click="open = !open"
    >
      <AppIcon name="plus" :size="18" />
    </button>
    </div>
  </div>
</template>

<style scoped>
.attachment-trigger { position: relative; }
.attachment-menu { position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 12; width: 280px; max-width: calc(100vw - 64px); padding: 6px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface); box-shadow: var(--shadow-float); }
.attachment-menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px; border: 0; border-radius: 8px; background: transparent; text-align: left; cursor: pointer; font-size: 13px; }
.attachment-menu button:hover:not(:disabled) { background: var(--color-surface-hover); }
.attachment-menu button:disabled { opacity: .5; cursor: not-allowed; }
.attachment-menu small { display: block; margin-top: 4px; font-size: 11px; color: var(--color-text-muted); }
.attachment-menu p { margin: 4px 10px 7px; color: var(--color-text-muted); font-size: 10px; }
.file-preview { width: 110px; flex-shrink: 0; padding: 8px; border: 1px solid var(--color-border); border-radius: 8px; }
.file-preview small { font-size: 10px; color: var(--color-text-muted); }
.image-preview-list { flex-wrap: wrap; max-height: 220px; overflow-y: auto; }
</style>
