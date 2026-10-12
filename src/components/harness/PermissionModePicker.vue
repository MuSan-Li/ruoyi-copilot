<script setup lang="ts">
import ComposerSelect from './ComposerSelect.vue'
import type { HarnessPermissionMode } from '../../types/harness'

interface Props {
  value: HarnessPermissionMode
  disabled?: boolean
  notice?: string
}

interface Emits {
  update: [value: HarnessPermissionMode]
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const options: Array<{ value: HarnessPermissionMode; label: string; hint: string }> = [
  { value: 'READ_ONLY', label: '只读', hint: '仅调查与分析' },
  { value: 'WORKSPACE_WRITE', label: '工作区写入', hint: '允许读取和修改当前工作区的文件' },
  { value: 'FULL_ACCESS', label: '完整访问', hint: '允许更广泛的文件与命令操作' },
]
</script>

<template>
  <ComposerSelect :value="value" label="权限模式" :options="options" :disabled="disabled" :notice="notice" icon="shield" align="left"
    @update="emit('update', $event)" />
</template>
