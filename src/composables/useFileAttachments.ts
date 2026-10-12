import { readonly, shallowRef } from 'vue'
import { createId } from '../utils/id'

export interface TextAttachment {
  id: string
  name: string
  byteSize: number
  file: File
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_ATTACHMENT_BYTES = 50 * 1024 * 1024

export function useFileAttachments() {
  const attachments = shallowRef<TextAttachment[]>([])
  const error = shallowRef('')
  const reading = shallowRef(false)
  async function addFiles(files: readonly File[]): Promise<void> {
    error.value = ''
    if (attachments.value.length + files.length > 5) {
      error.value = '最多添加 5 个附件'
      return
    }
    if (files.some(file => file.size > MAX_ATTACHMENT_BYTES)) {
      error.value = '单个附件不能超过 10 MB'
      return
    }
    if (attachments.value.reduce((size, file) => size + file.byteSize, 0) + files.reduce((size, file) => size + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
      error.value = '附件总大小不能超过 50 MB'
      return
    }
    attachments.value = [...attachments.value, ...files.map(file => ({
      id: createId('file'), name: file.name, byteSize: file.size, file,
    }))]
  }
  return {
    attachments: readonly(attachments), error: readonly(error), reading: readonly(reading), addFiles,
    remove: (id: string) => { attachments.value = attachments.value.filter(file => file.id !== id) },
    clear: () => { attachments.value = []; error.value = '' },
  }
}
