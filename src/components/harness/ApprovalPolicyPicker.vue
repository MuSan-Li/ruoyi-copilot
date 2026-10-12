<script setup lang="ts">
import ComposerSelect from './ComposerSelect.vue'
import type { HarnessApprovalPolicy } from '../../types/harness'

interface Props {
  value: HarnessApprovalPolicy
  disabled?: boolean
  notice?: string
}

interface Emits {
  update: [value: HarnessApprovalPolicy]
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const options: Array<{ value: HarnessApprovalPolicy; label: string; hint: string }> = [
  { value: 'NEVER', label: '全自动', hint: '权限范围内自动执行，不逐项请求确认' },
  { value: 'ON_REQUEST', label: '按需审批', hint: '执行、网络及破坏性操作先请求确认' },
]
</script>

<template>
  <ComposerSelect :value="value" label="审批策略" :options="options" :disabled="disabled" :notice="notice"
    @update="emit('update', $event)" />
</template>
