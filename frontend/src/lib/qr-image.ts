import jsQR from 'jsqr'

const MAX_SIDE = 1600

/** Decode a QR code from an image blob; null when none is found. Throws if the blob is not a readable image. */
export async function decodeQrFromBlob(blob: Blob): Promise<string | null> {
  const bmp = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  } finally {
    bmp.close()
  }
}
