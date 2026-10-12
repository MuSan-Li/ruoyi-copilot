import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchUrlShortcuts, type UrlShortcut } from '../api/urlApi'
import { useUrlShortcuts } from './useUrlShortcuts'

vi.mock('../api/urlApi', () => ({ fetchUrlShortcuts: vi.fn() }))
const fetchShortcuts = vi.mocked(fetchUrlShortcuts)
const link = (name: string): UrlShortcut => ({ urlId: name, name, url: 'https://example.com/' })

function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('URL shortcuts refresh behavior', () => {
  beforeEach(() => vi.resetAllMocks())

  it('deduplicates initial loading and explicitly refreshes an already loaded session', async () => {
    const request = pending<UrlShortcut[]>()
    fetchShortcuts.mockReturnValueOnce(request.promise).mockResolvedValueOnce([link('updated')])
    const state = useUrlShortcuts()
    const first = state.ensureLoaded()
    await state.ensureLoaded()
    expect(state.loading.value).toBe(true)
    expect(fetchShortcuts).toHaveBeenCalledTimes(1)
    request.resolve([link('first')])
    await first
    await state.ensureLoaded()
    expect(fetchShortcuts).toHaveBeenCalledTimes(1)
    await state.refresh()
    expect(state.shortcuts.value[0]?.name).toBe('updated')
  })

  it('represents an empty successful response without a loading error', async () => {
    fetchShortcuts.mockResolvedValue([])
    const state = useUrlShortcuts()
    await state.refresh()
    expect(state.loaded.value).toBe(true)
    expect(state.loading.value).toBe(false)
    expect(state.error.value).toBe('')
    expect(state.shortcuts.value).toEqual([])
  })

  it('exposes refresh failure and recovers on retry', async () => {
    fetchShortcuts.mockResolvedValueOnce([link('saved')])
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([link('recovered')])
    const state = useUrlShortcuts()
    await state.refresh()
    await state.refresh()
    expect(state.error.value).toBe('temporary failure')
    expect(state.loading.value).toBe(false)
    expect(state.shortcuts.value[0]?.name).toBe('saved')
    await state.refresh()
    expect(state.error.value).toBe('')
    expect(state.shortcuts.value[0]?.name).toBe('recovered')
  })

  it('does not let an older successful response replace a newer result', async () => {
    const old = pending<UrlShortcut[]>()
    const latest = pending<UrlShortcut[]>()
    fetchShortcuts.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const state = useUrlShortcuts()
    const first = state.refresh()
    const second = state.refresh()
    latest.resolve([link('new')]); await second
    old.resolve([link('old')]); await first
    expect(state.shortcuts.value[0]?.name).toBe('new')
    expect(state.loading.value).toBe(false)
  })

  it('ignores an older failure while the latest request is still loading', async () => {
    const old = pending<UrlShortcut[]>()
    const latest = pending<UrlShortcut[]>()
    fetchShortcuts.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const state = useUrlShortcuts()
    const first = state.refresh()
    const second = state.refresh()
    old.reject(new Error('stale failure')); await first
    expect(state.error.value).toBe('')
    expect(state.loading.value).toBe(true)
    latest.resolve([link('new')]); await second
    expect(state.shortcuts.value[0]?.name).toBe('new')
    expect(state.loading.value).toBe(false)
  })
})
