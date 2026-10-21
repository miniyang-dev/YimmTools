export type Fmt = 'keep' | 'webp' | 'jpeg' | 'png'

export interface Options {
  fmt: Fmt
  quality: number
  /** 0 = keep the original size */
  maxWidth: number
}

const MIME = { webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' } as const
const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

/** Two option sets with the same key produce the same output. */
export const optionsKey = (o: Options) => `${o.fmt}|${o.quality}|${o.maxWidth}`

/** The MIME type to encode to; "keep" falls back to WebP for formats we cannot write back. */
export function outputMime(file: Pick<File, 'type'>, fmt: Fmt): string {
  if (fmt !== 'keep') return MIME[fmt]
  return file.type === MIME.png || file.type === MIME.jpeg || file.type === MIME.webp ? file.type : MIME.webp
}

/** `photo.png` + a WebP result -> `photo.webp`. The extension follows what the browser really produced. */
export function outputName(originalName: string, blobType: string): string {
  return `${originalName.replace(/\.[^.]+$/, '')}.${EXT[blobType] ?? 'img'}`
}

export function scaledSize(width: number, height: number, maxWidth: number): { w: number; h: number } {
  const scale = maxWidth > 0 && width > maxWidth ? maxWidth / width : 1
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

export interface Transcoded {
  blob: Blob
  w: number
  h: number
}

export async function transcode(file: File, { fmt, quality, maxWidth }: Options): Promise<Transcoded> {
  const bitmap = await createImageBitmap(file)
  try {
    const { w, h } = scaledSize(bitmap.width, bitmap.height, maxWidth)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const mime = outputMime(file, fmt)
    if (mime === MIME.jpeg) {
      ctx.fillStyle = '#ffffff' // JPEG has no alpha
      ctx.fillRect(0, 0, w, h)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
    if (!blob) throw new Error('encode')
    return { blob, w, h }
  } finally {
    bitmap.close()
  }
}
