import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from './http'
import { harnessApi } from './harnessApi'

vi.mock('./http', () => ({ requestJson: vi.fn() }))
const request = vi.mocked(requestJson)
beforeEach(() => request.mockReset())

describe('OSS attachments', () => {
  it('uploads multipart files and reuses URLs on a send retry', async () => {
    request.mockResolvedValue({ fileName: 'report.pdf', url: 'https://files.example/report.pdf', ossId: '1' })
    const file = new File(['sample'], 'report.pdf')
    const result = await harnessApi.uploadAttachments([file])
    expect(request.mock.calls[0]![0]).toBe('/resource/oss/upload')
    expect(request.mock.calls[0]![1]!.body).toBeInstanceOf(FormData)
    expect(result[0]!.url).toBe('https://files.example/report.pdf')
    await harnessApi.uploadAttachments([file])
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('retries failed uploads instead of caching failure', async () => {
    const file = new File(['sample'], 'retry.txt')
    request.mockRejectedValueOnce(new Error('上传失败'))
      .mockResolvedValueOnce({ fileName: 'retry.txt', url: 'https://files.example/retry.txt', ossId: '2' })
    await expect(harnessApi.uploadAttachments([file])).rejects.toThrow('上传失败')
    await expect(harnessApi.uploadAttachments([file])).resolves.toHaveLength(1)
  })
})
