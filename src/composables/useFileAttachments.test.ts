import { describe, expect, it } from 'vitest'
import { useFileAttachments } from './useFileAttachments'

const MiB = 1024 * 1024

describe('file attachment limits', () => {
  it('accepts five 10 MB files without loading them into the chat message', async () => {
    const state = useFileAttachments()
    const files = Array.from({ length: 5 }, (_, i) => new File([new Uint8Array(10 * MiB)], `${i}.pdf`))
    await state.addFiles(files)
    expect(state.error.value).toBe('')
    expect(state.attachments.value).toHaveLength(5)
    expect(state.attachments.value.reduce((sum, file) => sum + file.byteSize, 0)).toBe(50 * MiB)
    expect(state.attachments.value[0]!.file).toBe(files[0])
  })

  it('rejects a file even one byte above 10 MB', async () => {
    const state = useFileAttachments()
    await state.addFiles([new File([new Uint8Array(10 * MiB + 1)], 'large.txt')])
    expect(state.error.value).toContain('10 MB')
    expect(state.attachments.value).toHaveLength(0)
  })

  it('preserves pending files after a rejected batch and supports removal', async () => {
    const state = useFileAttachments()
    await state.addFiles([new File(['hello'], 'notes.txt')])
    await state.addFiles(Array.from({ length: 5 }, () => new File(['x'], 'extra.txt')))
    expect(state.attachments.value).toHaveLength(1)
    state.remove(state.attachments.value[0]!.id)
    expect(state.attachments.value).toHaveLength(0)
    state.clear()
    expect(state.error.value).toBe('')
  })
})
