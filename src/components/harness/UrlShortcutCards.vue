<script setup lang="ts">
import type { UrlShortcut } from '../../api/urlApi'

interface Props {
  shortcuts: readonly UrlShortcut[]
  loading?: boolean
  error?: string
}

interface Emits {
  retry: []
}

defineProps<Props>()
const emit = defineEmits<Emits>()

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * 安全打开：仅允许 http(s) 协议，新标签页打开并隔离来源。
 */
function openLink(url: string): void {
  if (!/^https?:\/\//i.test(url.trim())) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function retry(): void {
  emit('retry')
}
</script>

<template>
  <div class="url-shortcuts" aria-live="polite">
    <div v-if="loading" class="url-shortcuts__status">
      <span class="spinner" />
      <span>正在加载快捷链接…</span>
    </div>

    <div v-else-if="error" class="url-shortcuts__status url-shortcuts__status--error">
      <span>快捷链接加载失败</span>
      <button type="button" class="link-button" @click="retry">重试</button>
    </div>

    <template v-else-if="shortcuts.length">
      <p class="url-shortcuts__title">常用链接</p>
      <div class="url-shortcut-grid">
        <button
          v-for="item in shortcuts"
          :key="item.urlId"
          type="button"
          class="url-shortcut-card"
          :title="item.description || item.url"
          @click="openLink(item.url)"
        >
          <span class="url-shortcut-card__name">
            <span class="url-shortcut-card__name-text">{{ item.name }}</span>
            <span class="url-shortcut-card__external" aria-label="外部链接" title="在新标签页打开">↗</span>
          </span>
          <span v-if="item.description" class="url-shortcut-card__desc">{{ item.description }}</span>
          <span class="url-shortcut-card__host">{{ hostOf(item.url) }}</span>
        </button>
      </div>
    </template>

    <div v-else class="url-shortcuts__status url-shortcuts__status--empty">
      <span>暂无常用链接，新建后将显示在这里</span>
    </div>
  </div>
</template>

<style scoped>
.url-shortcuts {
  width: min(540px, calc(100% - 40px));
  margin: 24px auto 0;
}

.url-shortcuts__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: var(--font-sm);
}

.url-shortcuts__status--error {
  color: var(--color-text-secondary);
}

.url-shortcuts__status--empty {
  padding: 20px 12px;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  font-size: var(--font-xs);
}

.url-shortcuts__title {
  margin: 0 0 10px;
  color: var(--color-text-muted);
  font-size: var(--font-xs);
  letter-spacing: 0.06em;
}

.url-shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr));
  gap: 10px;
}

.url-shortcut-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.url-shortcut-card:hover {
  border-color: var(--color-text-secondary);
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.03));
}

.url-shortcut-card__name {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.url-shortcut-card__name-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url-shortcut-card__external {
  flex: 0 0 auto;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.url-shortcut-card__desc {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url-shortcut-card__host {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-shortcuts {
  width: 100%;
  margin-top: 32px;
}

.empty-shortcuts .url-shortcuts__title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 12px;
  font-size: var(--font-xs);
  letter-spacing: 0;
  text-align: left;
}

.empty-shortcuts .url-shortcuts__title::after {
  height: 1px;
  flex: 1;
  background: var(--color-border);
  content: '';
}

.empty-shortcuts .url-shortcut-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
}

.empty-shortcuts .url-shortcut-card {
  gap: 6px;
  padding: 14px;
  border-color: #e2eaf0;
  background: #f7fafc;
}

.empty-shortcuts .url-shortcut-card:hover,
.empty-shortcuts .url-shortcut-card:focus-visible {
  border-color: #9bb6ca;
  background: #eff5f9;
}

.empty-shortcuts .url-shortcut-card__name-text {
  color: var(--color-text);
}

.empty-shortcuts .url-shortcut-card__external {
  color: var(--welcome-accent, #527c9b);
}
</style>
