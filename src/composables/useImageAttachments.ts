import { readonly, shallowRef } from 'vue'
import { createId } from '../utils/id'
import type { HarnessImageDetail, PendingImageAttachment } from '../types/harness'

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const maximumImages = 5
const maximumBytes = 50 * 1024 * 1024

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('图片读取结果无效'))
    reader.readAsDataURL(file)
  })
}

export function useImageAttachments() {
  const _attachments = shallowRef<PendingImageAttachment[]>([])
  const _error = shallowRef('')
  const reading = shallowRef(false)

  async function addFiles(
    files: readonly File[],
    detail: HarnessImageDetail = 'auto',
  ): Promise<void> {
    if (reading.value) return
    _error.value = ''
    const nextFiles = files.slice(0, maximumImages - _attachments.value.length)
    if (nextFiles.length !== files.length) {
      _error.value = `每次任务最多添加 ${maximumImages} 张图片`
    }
    const unsupported = nextFiles.find((file) => !acceptedTypes.has(file.type))
    if (unsupported) {
      _error.value = '仅支持 JPEG、PNG、GIF、WebP 图片'
      return
    }
    if (nextFiles.some(file => file.size > 10 * 1024 * 1024)) {
      _error.value = '单张图片不能超过 10 MB'
      return
    }
    const total = _attachments.value.reduce((sum, item) => sum + item.byteSize, 0)
      + nextFiles.reduce((sum, file) => sum + file.size, 0)
    if (total > maximumBytes) {
      _error.value = '图片总大小不能超过 50 MB'
      return
    }
    reading.value = true
    try {
      const additions = await Promise.all(nextFiles.map(async (file) => ({
        id: createId('image'),
        name: file.name,
        mediaType: file.type,
        byteSize: file.size,
        dataUrl: await readDataUrl(file),
        detail,
      } satisfies PendingImageAttachment)))
      _attachments.value = [..._attachments.value, ...additions]
    } catch (error) {
      _error.value = error instanceof Error ? error.message : String(error)
    } finally {
      reading.value = false
    }
  }

  /** 修改指定图片的精度（Doubao：low/high/xhigh；DeepSeek 语义保持 auto/low/original）。 */
  function setDetail(id: string, detail: HarnessImageDetail): void {
    _attachments.value = _attachments.value.map((item) =>
      item.id === id ? { ...item, detail } : item,
    )
  }

  function remove(id: string): void {
    _attachments.value = _attachments.value.filter((item) => item.id !== id)
  }

  function clear(): void {
    _attachments.value = []
    _error.value = ''
  }

  return {
    attachments: readonly(_attachments),
    error: readonly(_error),
    reading: readonly(reading),
    addFiles,
    setDetail,
    remove,
    clear,
  }
}
