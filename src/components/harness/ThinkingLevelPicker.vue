<script setup lang="ts">
import ComposerSelect from './ComposerSelect.vue'
import { THINKING_LEVEL_OPTIONS } from '../../utils/modelCapabilities'
import type { HarnessThinkingLevel } from '../../types/harness'

interface Props {
  value: HarnessThinkingLevel
  disabled?: boolean
  notice?: string
}

interface Emits {
  update: [value: HarnessThinkingLevel]
}

defineProps<Props>()
const emit = defineEmits<Emits>()

</script>

<template>
  <ComposerSelect :value="value" label="思考等级" :options="THINKING_LEVEL_OPTIONS" :disabled="disabled" :notice="notice" muted
    @update="emit('update', $event)" />
</template>
