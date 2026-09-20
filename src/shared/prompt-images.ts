import type { PromptImage } from './contracts'

export const MAX_PROMPT_IMAGES = 4
export const MAX_PROMPT_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_PROMPT_IMAGES_BYTES = 20 * 1024 * 1024
export const PROMPT_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function decodedBase64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(data.length * 3 / 4) - padding)
}

export function promptImageError(images: readonly PromptImage[]): string | undefined {
  if (images.length > MAX_PROMPT_IMAGES) return `最多添加 ${MAX_PROMPT_IMAGES} 张图片。`
  let totalBytes = 0
  for (const image of images) {
    if (!PROMPT_IMAGE_MIME_TYPES.has(image.mimeType)) return '仅支持 PNG、JPEG、WebP 和 GIF 图片。'
    const bytes = decodedBase64Bytes(image.data)
    if (!bytes) return '图片内容为空。'
    if (bytes > MAX_PROMPT_IMAGE_BYTES) return '单张图片不能超过 10 MB。'
    totalBytes += bytes
  }
  return totalBytes > MAX_PROMPT_IMAGES_BYTES ? '图片总大小不能超过 20 MB。' : undefined
}
