<script setup lang="ts">
import { computed } from 'vue'
import ComposerSelect from './ComposerSelect.vue'
import { isDoubaoModel, modelDisplayName } from '../../utils/modelCapabilities'
import type { ModelOption } from '../../types/harness'

interface Props {
  value: string
  models: readonly ModelOption[]
  disabled?: boolean
  notice?: string
}

interface Emits {
  update: [value: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const options = computed(() => {
  const names = [...new Set([props.value, ...props.models.map(model => model.name)].filter(Boolean))]
  return names.map(value => ({ value,
    label: modelDisplayName(value),
    hint: isDoubaoModel(value) ? '字节 · 多模态与编程' : props.models.find(model => model.name === value)?.provider,
  }))
})
</script>

<template>
  <ComposerSelect :value="value" label="模型" :options="options" :disabled="disabled" :notice="notice" icon="spark" searchable allow-custom
    @update="emit('update', $event)" />
</template>
