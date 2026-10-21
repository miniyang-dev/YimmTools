import { useCallback, useEffect, useRef, useState } from 'react'
import { optionsKey, transcode, type Options } from './transcode'

export interface Item {
  id: number
  file: File
  state: 'working' | 'done' | 'error'
  /** options the current result was produced with */
  key?: string
  blob?: Blob
  url?: string
  w?: number
  h?: number
}

let nextId = 1

/**
 * A list of images that is kept encoded with the given options. Adding a file, or changing the
 * options, re-encodes only what is out of date; a newer run supersedes an older one, files removed
 * mid-run are skipped, and every object URL is released when replaced, removed or unmounted.
 */
export function useImageBatch(options: Options) {
  const [items, setItems] = useState<Item[]>([])
  const itemsRef = useRef<Item[]>([])
  itemsRef.current = items
  const run = useRef(0)

  const add = useCallback((files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    setItems((cur) => [...cur, ...images.map((file) => ({ id: nextId++, file, state: 'working' as const }))])
  }, [])

  const remove = useCallback((id: number) => {
    const gone = itemsRef.current.find((i) => i.id === id)
    if (gone?.url) URL.revokeObjectURL(gone.url)
    setItems((cur) => cur.filter((i) => i.id !== id))
  }, [])

  const { fmt, quality, maxWidth } = options
  const idList = items.map((i) => i.id).join(',')
  useEffect(() => {
    const opts: Options = { fmt, quality, maxWidth }
    const key = optionsKey(opts)
    const myRun = ++run.current
    const stale = itemsRef.current.filter((i) => i.key !== key)
    if (!stale.length) return
    setItems((cur) => cur.map((i) => (i.key !== key ? { ...i, state: 'working' } : i)))
    void (async () => {
      for (const it of stale) {
        if (run.current !== myRun) return
        if (!itemsRef.current.some((x) => x.id === it.id)) continue // removed while we were busy
        try {
          const r = await transcode(it.file, opts)
          if (run.current !== myRun) return
          const url = URL.createObjectURL(r.blob)
          setItems((cur) =>
            cur.map((x) => {
              if (x.id !== it.id) return x
              if (x.url) URL.revokeObjectURL(x.url)
              return { ...x, state: 'done', key, blob: r.blob, url, w: r.w, h: r.h }
            }),
          )
        } catch {
          if (run.current === myRun)
            setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, state: 'error', key } : x)))
        }
      }
    })()
  }, [idList, fmt, quality, maxWidth])

  // release every object URL and stop any running batch when leaving the page
  useEffect(
    () => () => {
      run.current++
      itemsRef.current.forEach((i) => i.url && URL.revokeObjectURL(i.url))
    },
    [],
  )

  return { items, add, remove }
}
