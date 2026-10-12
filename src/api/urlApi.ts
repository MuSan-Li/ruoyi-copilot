import { requestJson } from './http'

/**
 * Copilot 新会话快捷链接
 */
export interface UrlShortcut {
  urlId: number | string
  name: string
  url: string
  description?: string | null
  sortOrder?: number | null
}

/**
 * 获取当前租户已启用的快捷链接（按排序升序）。
 * 后端允许 system:url:list 或 coding:harness:use 权限访问。
 */
export async function fetchUrlShortcuts(): Promise<UrlShortcut[]> {
  const data = await requestJson<UrlShortcut[]>('/system/url/shortcuts')
  if (!Array.isArray(data)) return []
  return data
    .filter((item) => item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url.trim()))
    .map((item) => ({
      urlId: item.urlId,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : item.url,
      url: item.url.trim(),
      description: typeof item.description === 'string' ? item.description : null,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : null,
    }))
}
