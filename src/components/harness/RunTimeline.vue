<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import type { HarnessEvent, HarnessRunState } from '../../types/harness'

interface Props {
  run: HarnessRunState
  events: readonly HarnessEvent[]
  connection: string
}

const props = defineProps<Props>()

const recentEvents = computed(() => props.events.slice(-5).reverse())
const modelRoute = computed(() => props.run.modelRoute ?? null)
const statusLabel = computed(() => ({
  QUEUED: '排队中',
  RUNNING: '执行中',
  WAITING_FOR_APPROVAL: '等待工具审批',
  WAITING_FOR_INPUT: '等待你的输入',
  SUSPENDED: '已安全挂起',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
})[props.run.status])
const taskClassLabel = computed(() => ({
  SIMPLE: '简单',
  COMPLEX: '复杂',
  VISION: '视觉',
})[modelRoute.value?.taskClass ?? 'SIMPLE'])
const routeSourceLabel = computed(() => ({
  AUTO_POLICY: '服务端自动路由',
  SESSION_FIXED: '会话固定模型',
  LEGACY_SESSION_FALLBACK: '历史会话兼容路由',
})[modelRoute.value?.source ?? 'LEGACY_SESSION_FALLBACK'])
const routeTitle = computed(() => {
  const route = modelRoute.value
  if (!route) return '当前服务端未返回模型路由信息'
  return `${routeSourceLabel.value} · 请求 ${route.requestedModel} · 策略 v${route.policyVersion}`
})

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    'run.created': '运行已创建',
    'run.started': '模型循环已开始',
    'run.waiting_for_approval': '等待工具审批',
    'run.waiting_for_input': '等待计划或补充输入',
    'run.completed': '运行已完成',
    'run.failed': '运行失败',
    'run.suspended': '运行已挂起',
    'assistant.completed': '模型回合已持久化',
    'tool.completed': '工具结果已持久化',
    'approval.requested': '请求危险操作审批',
  }
  return labels[type] ?? type
}
</script>

<template>
  <section class="run-timeline" aria-label="运行状态">
    <div class="run-summary">
      <span class="run-status" :class="`run-status--${run.status.toLowerCase()}`">
        <span v-if="run.status === 'RUNNING' || run.status === 'QUEUED'" class="spinner" />
        <AppIcon v-else name="check" :size="13" />
        {{ statusLabel }}
      </span>
      <span>回合 {{ run.iteration }}</span>
      <span>工具 {{ run.toolCallCount }}<template v-if="run.budget.maxToolCalls > 0"> / {{ run.budget.maxToolCalls }}</template></span>
      <span v-if="modelRoute" :title="routeTitle">模型 {{ modelRoute.selectedModel }}</span>
      <span v-if="modelRoute">分类 {{ taskClassLabel }}</span>
      <span v-if="modelRoute?.thinkingEnabled" title="本次运行由服务端开启深度思考">深度思考</span>
      <span class="run-id" :title="run.runId">{{ run.runId.slice(0, 8) }}</span>
    </div>
    <ol class="event-strip" aria-label="最近运行事件">
      <li v-if="recentEvents.length === 0" class="event-strip-placeholder">等待运行事件</li>
      <template v-else>
        <li v-for="event in recentEvents" :key="event.eventId">
          <span class="event-sequence">#{{ event.sequence }}</span>
          <span>{{ eventLabel(event.type) }}</span>
        </li>
      </template>
    </ol>
    <p v-if="run.error" class="run-error">{{ run.error }}</p>
    <p v-if="connection === 'RECONNECTING'" class="run-warning">事件流中断，正在按最后序号恢复，不会重复应用事件。</p>
  </section>
</template>
