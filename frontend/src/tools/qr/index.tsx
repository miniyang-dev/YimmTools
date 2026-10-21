import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useStrings, useT, type Strings } from '../../i18n'
import { decodeQrFromBlob } from '../../lib/qr-image'
import { DropZone, Field, Notice, OutputField, Seg, downloadBlob } from '../../ui'
import raw from './strings.json'

const strings = raw as unknown as Strings
type Level = 'L' | 'M' | 'Q' | 'H'
const LEVELS: Level[] = ['L', 'M', 'Q', 'H']

interface MakeState {
  text: string
  level: Level
  size: number
  margin: number
}

export default function QrTool() {
  const t = useStrings(strings)
  const [tab, setTab] = useState<'make' | 'read'>('make')
  // Lives here (not in <Make>) so what you typed survives a trip to the "Read" tab.
  const [make, setMake] = useState<MakeState>({ text: 'https://', level: 'M', size: 320, margin: 2 })
  return (
    <div className="stack">
      <Seg
        label="QR"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'make', label: t('make') },
          { value: 'read', label: t('read') },
        ]}
      />
      {tab === 'make' ? <Make state={make} onChange={(patch) => setMake((s) => ({ ...s, ...patch }))} /> : <Read />}
    </div>
  )
}

function Make({ state, onChange }: { state: MakeState; onChange: (patch: Partial<MakeState>) => void }) {
  const t = useStrings(strings)
  const { text, level, size, margin } = state
  const [err, setErr] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    if (!text) {
      setErr('')
      return
    }
    QRCode.toCanvas(el, text, {
      errorCorrectionLevel: level,
      width: size,
      margin,
      color: { dark: '#000000', light: '#ffffff' },
    }).then(
      () => setErr(''),
      () => setErr(t('tooLong')),
    )
  }, [text, level, size, margin, t])

  const ready = !!text && !err
  const png = () => canvas.current?.toBlob((b) => b && downloadBlob(b, 'qrcode.png'), 'image/png')
  const svg = async () => {
    const s = await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: level, margin })
    downloadBlob(new Blob([s], { type: 'image/svg+xml' }), 'qrcode.svg')
  }

  return (
    <>
      <Field label={t('text')}>
        <textarea
          value={text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={t('textPlaceholder')}
          rows={4}
          spellCheck={false}
        />
      </Field>
      <div className="grid2">
        <div className="field">
          <span className="label">{t('level')}</span>
          <Seg
            label={t('level')}
            value={level}
            onChange={(l) => onChange({ level: l })}
            options={LEVELS.map((l) => ({ value: l, label: t(`level${l}`) }))}
          />
        </div>
        <Field label={`${t('size')}: ${size}`}>
          <input
            type="range"
            min={160}
            max={720}
            step={20}
            value={size}
            onChange={(e) => onChange({ size: Number(e.target.value) })}
          />
        </Field>
        <Field label={`${t('margin')}: ${margin}`}>
          <input
            type="range"
            min={0}
            max={8}
            step={1}
            value={margin}
            onChange={(e) => onChange({ margin: Number(e.target.value) })}
          />
        </Field>
      </div>
      {err ? <Notice kind="err">{err}</Notice> : null}
      <div>
        <div className="qr-box" hidden={!ready}>
          <canvas ref={canvas} style={{ display: 'block', maxWidth: '100%', height: 'auto' }} />
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={png} disabled={!ready}>
          {t('downloadPng')}
        </button>
        <button type="button" className="btn ghost" onClick={svg} disabled={!ready}>
          {t('downloadSvg')}
        </button>
      </div>
    </>
  )
}

function Read() {
  const t = useStrings(strings)
  const c = useT()
  const [result, setResult] = useState('')
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState('')

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const decode = useCallback(
    async (blob: Blob) => {
      setErr('')
      setResult('')
      try {
        const text = await decodeQrFromBlob(blob)
        setPreview(URL.createObjectURL(blob))
        if (text !== null) setResult(text)
        else setErr(t('notFound'))
      } catch {
        setErr(t('loadFail'))
      }
    },
    [t],
  )

  const isUrl = /^https?:\/\//i.test(result)

  return (
    <>
      <DropZone accept="image/*" onFiles={([f]) => void decode(f)}>
        {t('drop')}
      </DropZone>
      {preview ? <img className="thumb" src={preview} alt="" /> : null}
      {err ? <Notice kind="err">{err}</Notice> : null}
      <OutputField label={t('decoded')} value={result} placeholder={t('emptyOut')} />
      {isUrl ? (
        <Notice kind="warn">
          {t('isUrl')} <span className="mono">{result}</span>
        </Notice>
      ) : null}
      <button
        type="button"
        className="btn ghost sm"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          setResult('')
          setErr('')
          setPreview('')
        }}
        disabled={!result && !err}
      >
        {c('common.clear')}
      </button>
    </>
  )
}
