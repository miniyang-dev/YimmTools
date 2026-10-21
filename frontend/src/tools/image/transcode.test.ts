import { describe, expect, it } from 'vitest'
import { optionsKey, outputMime, outputName, scaledSize } from './transcode'

describe('image helpers', () => {
  it('picks the output type; "keep" falls back to WebP for unsupported inputs', () => {
    expect(outputMime({ type: 'image/png' }, 'webp')).toBe('image/webp')
    expect(outputMime({ type: 'image/png' }, 'keep')).toBe('image/png')
    expect(outputMime({ type: 'image/jpeg' }, 'keep')).toBe('image/jpeg')
    expect(outputMime({ type: 'image/gif' }, 'keep')).toBe('image/webp')
    expect(outputMime({ type: '' }, 'jpeg')).toBe('image/jpeg')
  })

  it('names the output after what was really produced', () => {
    expect(outputName('photo.png', 'image/webp')).toBe('photo.webp')
    expect(outputName('my.holiday.photo.JPG', 'image/jpeg')).toBe('my.holiday.photo.jpg')
    expect(outputName('noext', 'image/png')).toBe('noext.png')
    expect(outputName('a.png', 'application/octet-stream')).toBe('a.img')
  })

  it('scales down only, keeping the aspect ratio', () => {
    expect(scaledSize(1600, 1200, 800)).toEqual({ w: 800, h: 600 })
    expect(scaledSize(1600, 1200, 0)).toEqual({ w: 1600, h: 1200 })
    expect(scaledSize(400, 300, 800)).toEqual({ w: 400, h: 300 }) // never upscales
    expect(scaledSize(10000, 1, 100)).toEqual({ w: 100, h: 1 }) // never collapses to zero
  })

  it('gives equal option sets equal keys', () => {
    const a = { fmt: 'webp' as const, quality: 0.8, maxWidth: 0 }
    expect(optionsKey(a)).toBe(optionsKey({ ...a }))
    expect(optionsKey(a)).not.toBe(optionsKey({ ...a, quality: 0.9 }))
  })
})
