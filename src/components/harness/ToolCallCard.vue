<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import AppIcon from '../AppIcon.vue'
import { toolIconName, toolNameLabel } from '../../utils/harnessLabels'

interface Props {
  toolCallId: string
  toolName: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  arguments?: string
  content?: string
  code?: string
}

const props = defineProps<Props>()
const expanded = shallowRef(false)
const statusText = computed(() => ({
  RUNNING: '执行中', COMPLETED: '已完成', FAILED: '失败',
})[props.status])
const displayName = computed(() => toolNameLabel(props.toolName))
const statusDetail = computed(() => props.code ? `${statusText.value} · ${props.code}` : statusText.value)

function formatPayload(value?: string): string {
  if (!value) return ''
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

const argumentsPreview = computed(() => formatPayload(props.arguments))
const contentPreview = computed(() => formatPayload(props.content))
</script>

<template>
  <article class="tool-call-card" :class="`tool-call-card--${status.toLowerCase()}`">
    <button class="tool-call-header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="tool-call-icon">
        <span v-if="status === 'RUNNING'" class="spinner" />
        <AppIcon v-else :name="toolIconName(toolName)" :size="16" :stroke-width="1.6" />
      </span>
      <span class="tool-call-copy">
        <strong :title="toolName">{{ displayName }}</strong>
      </span>
      <span class="tool-call-code" :title="statusDetail">{{ statusText }}</span>
      <AppIcon name="chevron" :size="13" :class="{ 'rotate-90': expanded }" />
    </button>
    <div v-if="expanded" class="tool-call-detail">
      <div class="tool-call-metadata"><code>{{ toolName }}</code><span>{{ statusDetail }}</span></div>
      <code class="tool-call-id">{{ toolCallId }}</code>
      <div v-if="argumentsPreview" class="tool-payload">
        <span class="tool-payload-label">输入参数</span>
        <pre tabindex="0" aria-label="工具输入参数">{{ argumentsPreview }}</pre>
      </div>
      <div v-if="contentPreview" class="tool-payload">
        <span class="tool-payload-label">执行结果</span>
        <pre tabindex="0" aria-label="工具执行结果">{{ contentPreview }}</pre>
      </div>
    </div>
  </article>
</template>

<style scoped>
.tool-call-metadata { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 5px; color: var(--color-text-muted); font-size: 10px; overflow-wrap: anywhere; }
.tool-call-id { display: block; margin-bottom: 10px; line-height: 1.5; }
.tool-payload + .tool-payload { margin-top: 12px; }
.tool-payload-label { display: block; margin-bottom: 5px; color: var(--color-text-muted); font-size: 10px; }
.tool-call-detail pre { max-height: 220px; margin: 0; padding: 10px 12px; border: 1px solid rgba(62, 83, 101, .09); border-radius: 7px; background: #f0f4f7; color: var(--color-text-secondary); font-size: 11px; line-height: 1.65; overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: auto; scrollbar-width: thin; scrollbar-color: #c5d0d8 transparent; }
.tool-call-detail pre:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
</style>
