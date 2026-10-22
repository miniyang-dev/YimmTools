import { cloneElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useLang, useT } from '../i18n'

export { CodeArea, CODE_LINE_PX, focusAt } from './CodeArea'

/**
 * Label + single control. The label is tied to the control by id (not by wrapping it), so the control's
 * own value never leaks into its accessible name, and the hint is announced via aria-describedby.
 */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactElement }) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        ...(hint ? { 'aria-describedby': hintId } : {}),
      })}
      {hint ? (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text),
    )
  }
  return Promise.resolve(legacyCopy(text))
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}

export function CopyButton({ text, label, small = true }: { text: string; label?: string; small?: boolean }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const onClick = useCallback(async () => {
    const ok = await copyText(text)
    setState(ok ? 'ok' : 'fail')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 1600)
  }, [text])
  return (
    <button type="button" className={`btn ghost${small ? ' sm' : ''}`} onClick={onClick} disabled={!text}>
      <span aria-live="polite">
        {state === 'ok' ? t('common.copied') : state === 'fail' ? t('common.copyFailed') : (label ?? t('common.copy'))}
      </span>
    </button>
  )
}

export function Output({ value, placeholder }: { value: string; placeholder?: string }) {
  if (!value) return <pre className="out empty">{placeholder ?? '—'}</pre>
  return <pre className="out">{value}</pre>
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'err' | 'ok' | 'warn'; children: ReactNode }) {
  return (
    <div className={`notice${kind === 'info' ? '' : ' ' + kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  fill = false,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
  /** on phones, lay the buttons out as an even grid instead of letting them wrap raggedly */
  fill?: boolean
}) {
  return (
    <div className={fill ? 'seg fill' : 'seg'} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="btn ghost sm"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Label/value rows. `compact` keeps label and value side by side on phones (for short values such as counts). */
export function Kv({ rows, compact = false }: { rows: [string, ReactNode, boolean?][]; compact?: boolean }) {
  return (
    <dl className={compact ? 'kv compact' : 'kv'}>
      {rows.map(([k, v, mono], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd className={mono ? 'mono' : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Label row (with a copy button) above a read-only output block. */
export function OutputField({
  label,
  value,
  placeholder,
  actions,
}: {
  label: string
  value: string
  placeholder?: string
  actions?: ReactNode
}) {
  return (
    <div className="field">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">{label}</span>
        <div className="row">
          {actions}
          <CopyButton text={value} />
        </div>
      </div>
      <Output value={value} placeholder={placeholder} />
    </div>
  )
}

/** Click, keyboard, drag-and-drop (and optional paste) target for files. */
export function DropZone({
  onFiles,
  accept,
  multiple = false,
  children,
}: {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  children: ReactNode
}) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const handle = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? [])
    if (files.length) onFiles(multiple ? files : files.slice(0, 1))
  }
  return (
    <div
      className={`drop${over ? ' over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        handle(e.dataTransfer.files)
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files)
        if (files.length) onFiles(multiple ? files : files.slice(0, 1))
      }}
    >
      {children}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** A ruled list of values, each with its own copy button. */
export function CopyList({ items, spaced = false }: { items: string[]; spaced?: boolean }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--rule)' }}>
      {items.map((item, i) => (
        <li
          key={i}
          className="row"
          style={{
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '1px solid var(--hair)',
            flexWrap: 'nowrap',
          }}
        >
          <code style={{ fontSize: '1rem', overflowWrap: 'anywhere', letterSpacing: spaced ? '0.03em' : undefined }}>
            {item || '—'}
          </code>
          <CopyButton text={item} />
        </li>
      ))}
    </ul>
  )
}

/** A button that opens the file picker (no drop area). */
export function FileButton({
  onFile,
  accept,
  children,
}: {
  onFile: (file: File) => void
  accept?: string
  children: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className="btn ghost sm" onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </>
  )
}

/** Value that only updates after `ms` of quiet — keeps expensive work off every keystroke or slider tick. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

/** "5 min" / "5分鐘" — localised magnitude of a time span given in seconds. */
export function useSpan(): (seconds: number) => string {
  const t = useT()
  const lang = useLang()
  return (seconds: number) => {
    const s = Math.abs(Math.round(seconds))
    const [n, unit] =
      s < 60
        ? [s, 'unit.s']
        : s < 3600
          ? [Math.round(s / 60), 'unit.m']
          : s < 86400
            ? [Math.round(s / 3600), 'unit.h']
            : [Math.round(s / 86400), 'unit.d']
    return lang === 'en' || lang === 'es' ? `${n} ${t(unit)}` : `${n}${t(unit)}`
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
