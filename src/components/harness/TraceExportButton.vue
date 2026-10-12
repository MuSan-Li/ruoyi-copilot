<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { exportHarnessTrace } from '../../utils/exportHarnessTrace'

const props = defineProps<{ sessionId: string; disabled?: boolean }>()
const exporting = shallowRef(false)
const error = shallowRef('')
const status = shallowRef('')
watch(() => props.sessionId, () => { error.value = ''; status.value = '' })

async function exportTrace(): Promise<void> {
  if (exporting.value || props.disabled) return
  const sessionId = props.sessionId
  exporting.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await exportHarnessTrace(sessionId)
    const url = URL.createObjectURL(new Blob([result.jsonl], { type: 'application/x-ndjson;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    if (props.sessionId === sessionId) {
      status.value = `已导出 ${result.counts.runs} 轮任务、${result.counts.messages} 条消息、${result.counts.events} 条事件`
    }
  } catch (cause) {
    if (props.sessionId === sessionId) error.value = cause instanceof Error ? cause.message : '导出失败，请重试'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="trace-export">
    <button class="task-preview-trigger" type="button" :disabled="disabled || exporting"
      title="导出所有轮次的原始消息、工具调用及结果、审批和执行事件（JSONL）" @click="exportTrace">
      <AppIcon name="file" :size="15" />
      <span>{{ exporting ? '正在导出…' : '导出完整轨迹' }}</span>
    </button>
    <span v-if="error" class="trace-feedback trace-error" role="alert">{{ error }}</span>
    <span v-else-if="status" class="trace-feedback" role="status">{{ status }}</span>
  </div>
</template>

<style scoped>
.trace-export { position: relative; }
.trace-feedback { position: absolute; top: calc(100% + 10px); right: 0; z-index: 30; width: max-content; max-width: min(420px, 80vw); padding: 10px 14px; border: 1px solid #d7e4dc; border-radius: 8px; background: #fff; color: #256345; font-size: 12px; box-shadow: 0 4px 18px #0001; }
.trace-error { color: #a33737; border-color: #efd2d2; }
</style>
