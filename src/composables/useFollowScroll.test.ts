import { afterEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { useFollowScroll } from './useFollowScroll'

vi.mock('vue', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue')>(),
  onBeforeUnmount: vi.fn(),
}))

function setup() {
  let selected = false
  let frame: FrameRequestCallback | undefined
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => { frame = undefined })
  const scrollTo = vi.fn()
  const element = {
    scrollHeight: 1000, clientHeight: 500, scrollTop: 480, scrollTo,
    ownerDocument: {
      getSelection: () => ({
        isCollapsed: !selected, rangeCount: 1,
        getRangeAt: () => ({ intersectsNode: () => true }),
      }),
    },
  } as unknown as HTMLElement
  const state = useFollowScroll(shallowRef(element))
  return { state, scrollTo, select: () => { selected = true }, clear: () => { selected = false }, flush: () => frame?.(0) }
}

afterEach(() => vi.unstubAllGlobals())

describe('text selection during streaming', () => {
  it('keeps selected text stationary and resumes following after selection is cleared', () => {
    const page = setup()
    page.select()
    page.state.followNewContent()
    page.flush()
    expect(page.scrollTo).not.toHaveBeenCalled()
    expect(page.state.hasNewContent.value).toBe(true)
    page.clear()
    page.state.followNewContent()
    page.flush()
    expect(page.scrollTo).toHaveBeenCalledOnce()
  })

  it('does not execute an already queued scroll after selection begins', () => {
    const page = setup()
    page.state.followNewContent()
    page.select()
    page.flush()
    expect(page.scrollTo).not.toHaveBeenCalled()
  })

  it('allows an explicit return to latest while text is selected', () => {
    const page = setup()
    page.select()
    page.state.scrollToLatest({ force: true })
    page.flush()
    expect(page.scrollTo).toHaveBeenCalledOnce()
  })
})
