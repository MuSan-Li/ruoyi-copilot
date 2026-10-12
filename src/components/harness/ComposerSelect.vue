<script setup lang="ts" generic="T extends string">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useId, useTemplateRef, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import type { AppIconName } from '../AppIcon.vue'

const props = withDefaults(defineProps<{
  value: T
  label: string
  options: readonly { value: T; label: string; hint?: string; badge?: string }[]
  disabled?: boolean
  icon?: AppIconName
  align?: 'left' | 'right'
  searchable?: boolean
  allowCustom?: boolean
  muted?: boolean
  notice?: string
}>(), { align: 'right' })
const emit = defineEmits<{ update: [value: T] }>()
const id = useId()
const open = shallowRef(false)
const query = shallowRef('')
const activeIndex = shallowRef(0)
const position = shallowRef<Record<string, string>>({})
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLDivElement>('menu')
const list = useTemplateRef<HTMLDivElement>('list')
const search = useTemplateRef<HTMLInputElement>('search')
const selected = computed(() => props.options.find(option => option.value === props.value))
const visibleOptions = computed(() => {
  const term = query.value.trim().toLowerCase()
  const options = props.options.filter(option => `${option.label} ${option.value}`.toLowerCase().includes(term))
  if (props.allowCustom && term && !props.options.some(option => option.value === query.value.trim())) {
    return [...options, { value: query.value.trim() as T, label: query.value.trim(), hint: '使用此模型名称' }]
  }
  return options
})

function close(restoreFocus = false): void {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

async function show(): Promise<void> {
  if (props.disabled) return
  query.value = ''
  activeIndex.value = Math.max(0, props.options.findIndex(option => option.value === props.value))
  const rect = trigger.value!.getBoundingClientRect()
  const width = Math.min(props.searchable ? 350 : 290, window.innerWidth - 24)
  const left = Math.max(12, Math.min(props.align === 'left' ? rect.left : rect.right - width, window.innerWidth - width - 12))
  const above = rect.top > 220 || rect.top > window.innerHeight - rect.bottom
  position.value = { left: `${left}px`, width: `${width}px`,
    maxHeight: `${Math.min(560, Math.max(140, (above ? rect.top : window.innerHeight - rect.bottom) - 20))}px`,
    ...(above ? { bottom: `${window.innerHeight - rect.top + 8}px` } : { top: `${rect.bottom + 8}px` }) }
  open.value = true
  await nextTick()
  if (props.searchable) search.value?.focus()
  else list.value?.focus()
  scrollActive()
}

function choose(value: T): void {
  if (props.disabled) return
  emit('update', value)
  close(true)
}

function scrollActive(): void {
  menu.value?.querySelector(`[data-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
  if (event.key === 'Tab') { close(true); return }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const length = visibleOptions.value.length
    if (!length) return
    if (event.key === 'Home') activeIndex.value = 0
    else if (event.key === 'End') activeIndex.value = length - 1
    else activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + length) % length
    scrollActive()
  } else if (event.key === 'Enter' || (event.key === ' ' && !props.searchable)) {
    event.preventDefault()
    const option = visibleOptions.value[activeIndex.value]
    if (option) choose(option.value)
  }
}

function onOutside(event: Event): void {
  const target = event.target as Node | null
  if (open.value && target && !menu.value?.contains(target) && !trigger.value?.contains(target)) close()
}
function onResize(): void { close() }
watch(query, () => { activeIndex.value = 0 })
watch(() => props.disabled, disabled => { if (disabled) close() })
onMounted(() => {
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('focusin', onOutside)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('focusin', onOutside)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <button ref="trigger" class="composer-select" :class="{ 'is-open': open, 'is-muted': muted }"
    type="button" :disabled="disabled" :aria-label="`${label}：${selected?.label ?? value}`"
    aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? id : undefined"
    :title="disabled ? '正在加载或提交，请稍后调整' : label"
    @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show()">
    <AppIcon v-if="icon" :name="icon" :size="15" />
    <span class="composer-select-value">{{ selected?.label ?? value }}</span>
    <AppIcon class="select-chevron" name="chevron" :size="12" />
  </button>
  <Teleport to="body">
    <div v-if="open" ref="menu" class="composer-select-menu" :style="position" tabindex="-1"
      @keydown="onKeydown">
      <div class="select-menu-heading">{{ label }}</div>
      <p v-if="notice" :id="`${id}-notice`" class="select-menu-notice">{{ notice }}</p>
      <div v-if="searchable" class="select-search">
        <AppIcon name="search" :size="14" />
        <input ref="search" v-model="query" :aria-label="`搜索${label}`" placeholder="搜索或输入模型名称" autocomplete="off"
          role="combobox" :aria-controls="id" aria-expanded="true" :aria-activedescendant="visibleOptions.length ? `${id}-${activeIndex}` : undefined" />
      </div>
      <div :id="id" ref="list" role="listbox" :tabindex="searchable ? -1 : 0" :aria-label="label" :aria-describedby="notice ? `${id}-notice` : undefined" :aria-activedescendant="visibleOptions.length ? `${id}-${activeIndex}` : undefined"
        class="select-option-list">
        <div v-for="(option, index) in visibleOptions" :id="`${id}-${index}`" :key="option.value" role="option"
          :aria-selected="option.value === value" :data-index="index" :data-value="option.value"
          class="select-option" :class="{ 'is-highlighted': index === activeIndex }"
          @pointermove="activeIndex = index" @click="choose(option.value)">
          <span class="select-option-copy"><span class="select-option-name">{{ option.label }}
            <small v-if="option.badge" class="select-option-badge">{{ option.badge }}</small></span>
            <span v-if="option.hint" class="select-option-hint">{{ option.hint }}</span></span>
          <AppIcon v-if="option.value === value" name="check" :size="16" />
        </div>
        <p v-if="!visibleOptions.length" class="select-empty">没有匹配的选项</p>
      </div>
      <p class="select-menu-footer">↑ ↓ 选择 <span>Enter 确认</span></p>
    </div>
  </Teleport>
</template>

<style scoped>
.composer-select { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 280px; height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--color-text); font: inherit; font-size: 12px; font-weight: 550; white-space: nowrap; cursor: pointer; }
.composer-select:hover:not(:disabled), .composer-select.is-open { background: var(--color-surface-hover); }
.composer-select:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.composer-select:disabled { cursor: default; opacity: .7; }
.composer-select.is-muted { color: var(--color-text-secondary); font-weight: 400; }
.composer-select-value { overflow: hidden; text-overflow: ellipsis; }
.select-chevron { flex-shrink: 0; transform: rotate(90deg); color: var(--color-text-muted); }
.composer-select-menu { position: fixed; z-index: 1000; display: flex; flex-direction: column; padding: 7px; border: 1px solid var(--color-border-strong); border-radius: 13px; background: var(--color-surface); box-shadow: var(--shadow-float); outline: 0; color: var(--color-text); }
.select-menu-heading { padding: 7px 9px 10px; font-size: 11px; color: var(--color-text-muted); font-weight: 500; }
.select-menu-notice { margin: 0 9px 9px; font-size: 11px; line-height: 1.6; color: var(--color-text-secondary); }
.select-option-list { overflow-y: auto; min-height: 0; overscroll-behavior: contain; outline: 0; }
.select-option { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 10px; border-radius: 7px; cursor: pointer; }
.select-option.is-highlighted { background: var(--color-surface-hover); }
.select-option[aria-selected="true"] > svg { color: var(--color-text); flex-shrink: 0; }
.select-option-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.select-option-name { font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
.select-option-hint { font-size: 11px; line-height: 1.5; color: var(--color-text-muted); overflow-wrap: anywhere; }
.select-option-badge { display: inline-block; margin-left: 7px; padding: 1px 5px; border-radius: 4px; background: var(--color-surface-hover); color: var(--color-text-secondary); font-size: 9px; vertical-align: 1px; }
.select-menu-footer { display: flex; justify-content: space-between; flex: 0 0 auto; margin: 6px 3px 0; padding: 9px 7px 3px; border-top: 1px solid var(--color-border); font-size: 10px; color: var(--color-text-muted); }
.select-search { display: flex; align-items: center; gap: 7px; margin: 0 4px 6px; padding: 8px; border: 1px solid var(--color-border-strong); border-radius: 6px; color: var(--color-text-muted); }
.select-search input { width: 100%; min-width: 0; border: 0; background: transparent; outline: 0; color: var(--color-text); font: inherit; font-size: 12px; }
.select-empty { padding: 10px; color: var(--color-text-muted); font-size: 12px; }
@media(max-width: 640px) { .composer-select { height: 30px; padding: 0 5px; font-size: 11px; gap: 4px; max-width: 196px; } }
</style>
