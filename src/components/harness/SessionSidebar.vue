<script setup lang="ts">
import { computed, nextTick, shallowRef, useId, useTemplateRef, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { permissionModeLabel } from '../../utils/harnessLabels'
import type { HarnessSessionState } from '../../types/harness'

interface Props {
  sessions: readonly HarnessSessionState[]
  activeSessionId: string | null
  loading: boolean
  open: boolean
  userName: string
  busy: boolean
  actionId: string | null
  actionError: string
}

interface Emits {
  collapse: []
  close: []
  newSession: []
  select: [sessionId: string]
  logout: []
  pin: [sessionId: string, pinned: boolean]
  delete: [sessionId: string]
  clearActionError: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const query = shallowRef('')
const menuId = useId()
const menu = useTemplateRef<HTMLDivElement>('menu')
const deleteDialog = useTemplateRef<HTMLDialogElement>('deleteDialog')
const newThread = useTemplateRef<HTMLButtonElement>('newThread')
const menuSession = shallowRef<HarnessSessionState | null>(null)
const menuOpen = shallowRef(false)
const menuPosition = shallowRef<Record<string, string>>({})
const deleteTarget = shallowRef<HarnessSessionState | null>(null)
const actionBusy = computed(() => props.busy || props.actionId !== null)
let menuTrigger: HTMLButtonElement | null = null

const visibleSessions = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  const matching = !normalized ? [...props.sessions] : props.sessions.filter((session) =>
    (session.title ?? '').toLocaleLowerCase().includes(normalized)
    || session.workspace.toLocaleLowerCase().includes(normalized),
  )
  return matching.sort((left, right) => (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0)
    || right.updatedAt - left.updatedAt || left.sessionId.localeCompare(right.sessionId))
})
const sessionGroups = computed(() => [
  { label: '已置顶', pinned: true, sessions: visibleSessions.value.filter(session => (session.pinnedAt ?? 0) > 0) },
  { label: '最近会话', pinned: false, sessions: visibleSessions.value.filter(session => !session.pinnedAt) },
].filter(group => group.sessions.length))

async function openMenu(session: HarnessSessionState, event: MouseEvent | KeyboardEvent): Promise<void> {
  if (actionBusy.value) return
  const trigger = event.currentTarget as HTMLButtonElement
  if (menuOpen.value && menuSession.value?.sessionId === session.sessionId) {
    closeMenu()
    return
  }
  menuTrigger = trigger
  menuSession.value = session
  const rect = trigger.getBoundingClientRect()
  menuPosition.value = {
    left: `${Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188))}px`,
    top: `${Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - 108))}px`,
  }
  await nextTick()
  menu.value?.showPopover()
  menu.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

function closeMenu(restoreFocus = true): void {
  if (menu.value?.matches(':popover-open')) menu.value.hidePopover()
  if (restoreFocus) menuTrigger?.focus()
}

function menuKeys(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[index]?.focus()
  } else if (event.key === 'Tab') closeMenu()
}

function togglePin(): void {
  const session = menuSession.value
  closeMenu()
  if (session) emit('pin', session.sessionId, !session.pinnedAt)
}

async function requestDelete(): Promise<void> {
  deleteTarget.value = menuSession.value
  emit('clearActionError')
  closeMenu(false)
  await nextTick()
  deleteDialog.value?.showModal()
}

function closeDeleteDialog(): void {
  if (props.actionId) return
  deleteDialog.value?.close()
  deleteTarget.value = null
  menuTrigger?.focus()
}

watch(() => props.sessions, sessions => {
  if (deleteTarget.value && !sessions.some(session => session.sessionId === deleteTarget.value?.sessionId)) {
    deleteDialog.value?.close()
    deleteTarget.value = null
    newThread.value?.focus()
  }
})
watch(() => props.open, () => closeMenu(false))

function formatTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function select(sessionId: string): void {
  emit('select', sessionId)
  emit('close')
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--open': open }">
    <div class="window-bar">
      <div class="window-brand"><span class="brand-glyph">H</span> Harness</div>
      <button class="icon-button sidebar-toggle" aria-label="收起侧栏" @click="emit('collapse')">
        <AppIcon name="panel" :size="17" />
      </button>
    </div>

    <div class="sidebar-content" @scroll.passive="closeMenu(false)">
      <button ref="newThread" class="new-thread" type="button" :disabled="busy" @click="emit('newSession')">
        <AppIcon name="compose" :size="17" />
        <span>{{ busy ? '正在创建…' : '新建编程任务' }}</span>
        <kbd>⌘ N</kbd>
      </button>
      <label class="sidebar-search">
        <AppIcon name="search" :size="15" />
        <input v-model="query" type="search" aria-label="搜索会话或工作区" placeholder="搜索会话或工作区" />
      </label>

      <div class="thread-list">
        <div v-if="loading && sessions.length === 0" class="sidebar-state"><span class="spinner" /> 正在同步</div>
        <div v-else-if="visibleSessions.length === 0" class="sidebar-state">{{ query ? '没有匹配的会话' : '暂无会话' }}</div>
        <template v-else>
          <section v-for="group in sessionGroups" :key="group.label" :aria-label="group.label" class="thread-group">
            <div class="thread-group-label"><AppIcon v-if="group.pinned" name="pin" :size="12" />{{ group.label }}</div>
            <div v-for="session in group.sessions" :key="session.sessionId" class="thread-item"
              :class="{ 'thread-item--active': session.sessionId === activeSessionId,
                'thread-item--menu-open': menuOpen && menuSession?.sessionId === session.sessionId }"
              :data-session-id="session.sessionId">
              <button type="button" class="thread-select" :aria-current="session.sessionId === activeSessionId ? 'page' : undefined"
                :title="session.title || '未命名任务'" @click="select(session.sessionId)">
                <span class="thread-title">{{ session.title || '未命名任务' }}</span>
                <span class="thread-preview">{{ permissionModeLabel(session.permissionMode) }} · {{ session.model }}</span>
                <span class="thread-time">{{ formatTime(session.updatedAt) }}</span>
              </button>
              <button type="button" class="thread-more" :disabled="actionBusy"
                :aria-label="`会话操作：${session.title || '未命名任务'}`" title="会话操作"
                aria-haspopup="menu" :aria-controls="menuId"
                :aria-expanded="menuOpen && menuSession?.sessionId === session.sessionId"
                @click="openMenu(session, $event)" @keydown.down.prevent="openMenu(session, $event)">
                <span v-if="actionId === session.sessionId" class="spinner" />
                <AppIcon v-else name="more" :size="16" />
              </button>
            </div>
          </section>
        </template>
      </div>
      <div v-if="actionError && !deleteTarget" class="session-action-error" role="alert">
        <span>{{ actionError }}</span>
        <button class="icon-button" type="button" aria-label="关闭操作错误" @click="emit('clearActionError')"><AppIcon name="x" :size="13" /></button>
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="account-row">
        <span class="avatar">{{ (userName || '用户').slice(0, 1).toLocaleUpperCase() }}</span>
        <span class="account-copy">
          <strong>{{ userName || '当前用户' }}</strong>
          <small>已安全登录</small>
        </span>
        <button class="account-logout" type="button" title="退出登录" @click="emit('logout')">
          退出
        </button>
      </div>
    </div>
  </aside>

  <Teleport to="body">
    <div :id="menuId" ref="menu" popover="auto" role="menu" aria-label="会话操作"
      class="session-action-menu" :style="menuPosition" @keydown="menuKeys"
      @toggle="menuOpen = ($event as ToggleEvent).newState === 'open'">
      <button type="button" role="menuitem" @click="togglePin"><AppIcon name="pin" :size="15" />{{ menuSession?.pinnedAt ? '取消置顶' : '置顶会话' }}</button>
      <button type="button" role="menuitem" class="danger-action" @click="requestDelete"><AppIcon name="trash" :size="15" />删除会话</button>
    </div>
    <dialog ref="deleteDialog" class="session-delete-dialog" aria-labelledby="session-delete-title"
      aria-describedby="session-delete-description" @cancel.prevent="closeDeleteDialog">
      <h2 id="session-delete-title">删除这个会话？</h2>
      <p class="session-delete-name">{{ deleteTarget?.title || '未命名任务' }}</p>
      <p id="session-delete-description">会话将从列表中移除，工作区中的代码文件不受影响。删除后可撤销。</p>
      <p v-if="actionError" class="session-delete-error" role="alert">{{ actionError }}</p>
      <div class="session-delete-actions">
        <button type="button" :disabled="!!actionId" autofocus @click="closeDeleteDialog">取消</button>
        <button type="button" class="danger-button" :disabled="actionBusy" @click="deleteTarget && emit('delete', deleteTarget.sessionId)">
          {{ actionId ? '正在删除…' : '删除会话' }}
        </button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.session-action-menu { inset: auto; width: 180px; margin: 0; padding: 5px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface); box-shadow: var(--shadow-float); color: var(--color-text); }
.session-action-menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 7px; background: transparent; font-size: 13px; text-align: left; cursor: pointer; }
.session-action-menu button:hover, .session-action-menu button:focus-visible { background: var(--color-surface-hover); }
.session-action-menu .danger-action { color: var(--color-danger); }
.session-action-error { display: flex; align-items: start; padding: 10px; gap: 4px; color: var(--color-danger); font-size: 12px; line-height: 1.6; }
.session-action-error > span { flex: 1; }
.session-delete-dialog { width: min(420px, calc(100vw - 32px)); padding: 24px; border: 1px solid var(--color-border); border-radius: 18px; box-shadow: var(--shadow-float); color: var(--color-text); background: var(--color-surface); }
.session-delete-dialog::backdrop { background: rgba(25, 38, 48, .22); backdrop-filter: blur(2px); }
.session-delete-dialog h2 { margin: 0 0 16px; font-size: 18px; font-weight: 600; }
.session-delete-dialog p { margin: 10px 0; font-size: 13px; line-height: 1.7; color: var(--color-text-secondary); }
.session-delete-dialog .session-delete-name { color: var(--color-text); font-weight: 500; overflow-wrap: anywhere; }
.session-delete-dialog .session-delete-error { color: var(--color-danger); }
.session-delete-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
.session-delete-actions button { padding: 9px 16px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); cursor: pointer; font-size: 13px; }
.session-delete-actions button:hover { background: var(--color-surface-hover); }
.session-delete-actions .danger-button { border-color: transparent; background: var(--color-danger); color: #fff; }
.session-delete-actions .danger-button:hover { background: #b83e3e; }
.session-delete-actions button:disabled { opacity: .55; cursor: wait; }
</style>
