import { useCallback, useEffect, useRef, useState } from 'react'
import { useStrings } from '../../i18n'
import { strings } from './strings'
import type { Report } from './types'

/** How many times to ask again when the server says it is busy, and the longest pause between asks. */
const BUSY_RETRIES = 2
const MAX_PAUSE_MS = 6000

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(id)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

/**
 * Runs one inspection against the backend. When the server answers "busy" it waits and asks
 * again by itself (`queued` is true meanwhile); leaving the page cancels everything.
 */
export function useInspection() {
  const t = useStrings(strings)
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const abort = useRef<AbortController>()
  useEffect(() => () => abort.current?.abort(), [])

  const inspect = useCallback(
    async (url: string) => {
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      setBusy(true)
      setQueued(false)
      setError('')
      setReport(null)
      try {
        for (let attempt = 0; ; attempt++) {
          const res = await fetch('/api/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: controller.signal,
          })
          const body = await res.json().catch(() => ({}))
          if (res.ok) {
            setReport(body as Report)
            return
          }
          if (res.status === 503 && body.code === 'busy' && attempt < BUSY_RETRIES) {
            setQueued(true)
            await sleep(Math.min((body.retry_after ?? 5) * 1000, MAX_PAUSE_MS), controller.signal)
            continue
          }
          const key = `err_${body.code ?? 'inspect_failed'}`
          const message = t(key, { n: body.retry_after ?? 60 })
          setError(message === key ? t('err_inspect_failed') : message)
          return
        }
      } catch (err) {
        if (!isAbort(err)) setError(t('err_network'))
      } finally {
        if (abort.current === controller) {
          setBusy(false)
          setQueued(false)
        }
      }
    },
    [t],
  )

  return { inspect, busy, queued, error, report }
}
