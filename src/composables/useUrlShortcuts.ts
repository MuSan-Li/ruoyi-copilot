import { readonly, shallowRef } from 'vue'
import { fetchUrlShortcuts, type UrlShortcut } from '../api/urlApi'

/**
 * Copilot 新会话快捷链接状态管理。
 * - loading：加载 / 刷新中（首次加载、再次新建、重试都可见）
 * - data：已启用且按排序返回的链接（后端返回空列表时正常呈现空状态）
 * - error：最近一次加载失败信息（失败时不清空已有数据，模板以 error 分支为准）
 * - refresh：重新从后端拉取（新建编程任务时必须调用以获取后台最新数据）
 *
 * 所有刷新路径（首次加载、新建任务、点击重试）行为一致：
 * 始终展示 loading，失败时设置 error 并保留重试入口，成功时清空 error。
 */
export function useUrlShortcuts() {
  const _shortcuts = shallowRef<UrlShortcut[]>([])
  const _loading = shallowRef(false)
  const _loaded = shallowRef(false)
  const _error = shallowRef('')

  let requestSeq = 0

  async function refresh(): Promise<void> {
    const seq = ++requestSeq
    _loading.value = true
    _error.value = ''
    try {
      const list = await fetchUrlShortcuts()
      if (seq !== requestSeq) return
      _shortcuts.value = list
      _error.value = ''
    } catch (error) {
      if (seq !== requestSeq) return
      // 失败时保留已有数据不清空；模板以 error 分支为准并提供重试入口
      _error.value = error instanceof Error && error.message
        ? error.message
        : '快捷链接加载失败'
    } finally {
      if (seq === requestSeq) {
        _loading.value = false
        _loaded.value = true
      }
    }
  }

  /**
   * 首次进入时加载；已加载过则不重复请求（新建任务时应显式调用 refresh）。
   */
  async function ensureLoaded(): Promise<void> {
    if (_loaded.value || _loading.value) return
    await refresh()
  }

  return {
    shortcuts: readonly(_shortcuts),
    loading: readonly(_loading),
    loaded: readonly(_loaded),
    error: readonly(_error),
    refresh,
    ensureLoaded,
  }
}
