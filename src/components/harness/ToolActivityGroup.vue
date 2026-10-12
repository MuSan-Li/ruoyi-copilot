<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import ToolCallCard from './ToolCallCard.vue'
import { toolNameLabel } from '../../utils/harnessLabels'
import type { DisplayToolActivity } from '../../types/ui'

interface Props {
  tools: readonly DisplayToolActivity[]
}

const props = defineProps<Props>()
const expanded = shallowRef(false)
const pageSize = 10
const pageCount = computed(() => Math.max(1, Math.ceil(props.tools.length / pageSize)))
const page = shallowRef(pageCount.value)
const pageTools = computed(() => props.tools.slice((page.value - 1) * pageSize, page.value * pageSize))
const rangeStart = computed(() => props.tools.length ? (page.value - 1) * pageSize + 1 : 0)
const rangeEnd = computed(() => Math.min(page.value * pageSize, props.tools.length))

watch(pageCount, (count, previous) => {
  // Follow newly arriving tools only while the user is viewing the latest page.
  if (page.value === previous || page.value > count) page.value = count
})
watch(() => props.tools[0]?.toolCallId, () => { page.value = pageCount.value })

const runningCount = computed(() => props.tools.filter((tool) => tool.status === 'RUNNING').length)
const failedCount = computed(() => props.tools.filter((tool) => tool.status === 'FAILED').length)
const latestTool = computed(() => props.tools.at(-1))
const summary = computed(() => {
  if (runningCount.value) return `正在调用 ${runningCount.value} 个工具`
  if (failedCount.value) return `${props.tools.length} 个工具 · ${failedCount.value} 个失败`
  return `${props.tools.length} 个工具已完成`
})
</script>

<template>
  <section class="tool-activity" :class="{ 'tool-activity--active': runningCount > 0 }" aria-label="工具活动">
    <button
      class="tool-activity-trigger"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="tool-activity-status" aria-hidden="true">
        <span v-if="runningCount" class="spinner" />
        <AppIcon v-else name="command" :size="16" :stroke-width="1.6" />
      </span>
      <span class="tool-activity-copy">
        <strong>{{ summary }}</strong>
        <small v-if="latestTool">最近：{{ toolNameLabel(latestTool.toolName) }}</small>
      </span>
      <AppIcon name="chevron" :size="14" :class="{ 'rotate-90': expanded }" />
    </button>
    <div v-if="expanded" class="tool-activity-content">
      <nav class="tool-pagination" aria-label="工具分页">
        <span aria-live="polite">{{ rangeStart }}–{{ rangeEnd }} / {{ tools.length }} 条</span>
        <div class="tool-pagination-controls">
          <button type="button" aria-label="工具上一页" title="上一页" :disabled="page <= 1" @click="page--"><AppIcon class="previous-page-icon" name="chevron" :size="13" /></button>
          <select v-model.number="page" aria-label="工具页码">
            <option v-for="number in pageCount" :key="number" :value="number">{{ number }} / {{ pageCount }} 页</option>
          </select>
          <button type="button" aria-label="工具下一页" title="下一页" :disabled="page >= pageCount" @click="page++"><AppIcon name="chevron" :size="13" /></button>
        </div>
      </nav>
      <div class="tool-page-list">
      <ToolCallCard
        v-for="tool in pageTools"
        :key="tool.toolCallId"
        :tool-call-id="tool.toolCallId"
        :tool-name="tool.toolName"
        :status="tool.status"
        :arguments="tool.arguments"
        :content="tool.content"
        :code="tool.code"
      />
      </div>
    </div>
  </section>
</template>

<style scoped>
.tool-activity { --tool-border: rgba(62, 83, 101, .09); background: #f8fafc; border-color: var(--tool-border); box-shadow: none; }
.tool-activity-trigger { padding: 10px 12px; }
.tool-activity-status { background: #edf2f6; color: var(--color-text-secondary); }
.tool-activity-copy strong { font-weight: 600; }
.tool-activity-copy small { font-family: inherit; }
.tool-activity-content { padding: 0 12px 8px; border-top-color: var(--tool-border); }
.tool-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 3px; color: var(--color-text-muted); font-size: 10px; border-bottom: 1px solid var(--tool-border); }
.tool-pagination-controls { display: flex; align-items: center; gap: 2px; }
.tool-pagination button, .tool-pagination select { min-height: 26px; padding: 3px 6px; border: 0; border-radius: 5px; background: transparent; color: var(--color-text-secondary); font: inherit; cursor: pointer; }
.tool-pagination button { display: grid; place-items: center; width: 26px; }
.tool-pagination button:active { transform: none; }
.previous-page-icon { transform: rotate(180deg); }
.tool-pagination button:hover:not(:disabled) { background: var(--color-surface-hover); }
.tool-pagination button:disabled { opacity: .4; cursor: default; }
.tool-page-list { min-width: 0; max-width: 100%; overflow: clip; }
.tool-page-list :deep(.tool-call-card) { margin: 0; border: 0; border-bottom: 1px solid var(--tool-border); border-radius: 0; background: transparent; }
.tool-page-list :deep(.tool-call-card:last-child) { border-bottom: 0; }
.tool-page-list :deep(.tool-call-header) { min-height: 44px; padding: 9px 3px; gap: 8px; border-radius: 6px; }
.tool-page-list :deep(.tool-call-header:hover) { background: rgba(218, 231, 239, .24); }
.tool-page-list :deep(.tool-call-copy strong) { font-size: 12px; font-weight: 500; }
.tool-page-list :deep(.tool-call-icon) { width: 22px; height: 22px; background: transparent; }
.tool-page-list :deep(.tool-call-card--failed .tool-call-code),
.tool-page-list :deep(.tool-call-card--failed .tool-call-icon) { color: var(--color-danger); }
.tool-page-list :deep(.tool-call-detail) { padding: 2px 3px 14px 33px; }
@media (max-width: 560px) {
  .tool-page-list :deep(.tool-call-detail) { padding-left: 3px; }
}
</style>
