import { useEffect, useState } from 'react'
import { useStrings, useT, type Strings } from '../../i18n'
import { CopyButton, Field, FileButton, Kv, Notice, useNow } from '../../ui'
import { cleanBase32, isBase32 } from '../../lib/base32'
import { decodeQrFromBlob } from '../../lib/qr-image'
import { parseOtpauth, totp, type TotpAlgo } from '../../lib/totp'
import raw from './strings.json'

const strings = raw as unknown as Strings
const SAMPLE = 'JBSWY3DPEHPK3PXP'

function group(code: string): string {
  const h = Math.floor(code.length / 2)
  return `${code.slice(0, h)} ${code.slice(h)}`
}

export default function TotpTool() {
  const t = useStrings(strings)
  const c = useT()
  const [secretInput, setSecretInput] = useState('')
  const [digits, setDigits] = useState(6)
  const [period, setPeriod] = useState(30)
  const [algo, setAlgo] = useState<TotpAlgo>('SHA-1')
  const [meta, setMeta] = useState<{ issuer?: string; account?: string }>({})
  const [qrErr, setQrErr] = useState(false)

  const now = useNow(250)
  const counter = Math.floor(now / 1000 / period)
  const elapsed = (now / 1000) % period
  const left = Math.ceil(period - elapsed)

  const secret = cleanBase32(secretInput)
  const valid = secret.length > 0 && isBase32(secret)

  const applyUri = (uri: string): boolean => {
    const p = parseOtpauth(uri)
    if (!p) return false
    setSecretInput(p.secret)
    setDigits(p.digits)
    setPeriod(p.period)
    setAlgo(p.algo)
    setMeta({ issuer: p.issuer, account: p.account })
    return true
  }

  const onSecret = (v: string) => {
    if (/^otpauth:\/\//i.test(v.trim()) && applyUri(v)) return
    setMeta({})
    setSecretInput(v)
  }

  const [codes, setCodes] = useState<{ cur: string; next: string } | null>(null)
  useEffect(() => {
    let alive = true
    if (!valid) {
      setCodes(null)
      return
    }
    const at = counter * period * 1000
    Promise.all([
      totp(secret, at, { period, digits, algo }),
      totp(secret, at + period * 1000, { period, digits, algo }),
    ]).then(
      ([cur, next]) => alive && setCodes({ cur, next }),
      () => alive && setCodes(null),
    )
    return () => {
      alive = false
    }
  }, [secret, valid, counter, period, digits, algo])

  const fromQr = async (f: File) => {
    setQrErr(false)
    try {
      const text = await decodeQrFromBlob(f)
      if (text === null || !applyUri(text)) setQrErr(true)
    } catch {
      setQrErr(true)
    }
  }

  return (
    <div className="stack">
      <Field label={t('secret')} hint={t('secretHint')}>
        <input
          type="text"
          className="mono"
          value={secretInput}
          onChange={(e) => onSecret(e.target.value)}
          placeholder={t('secretPlaceholder')}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>

      <div className="row">
        <label className="row" style={{ gap: 8 }}>
          <span className="label">{t('digits')}</span>
          <select value={digits} onChange={(e) => setDigits(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={6}>6</option>
            <option value={7}>7</option>
            <option value={8}>8</option>
          </select>
        </label>
        <label className="row" style={{ gap: 8 }}>
          <span className="label">{t('period')}</span>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={30}>30</option>
            <option value={60}>60</option>
            <option value={15}>15</option>
          </select>
        </label>
        <label className="row" style={{ gap: 8 }}>
          <span className="label">{t('algo')}</span>
          <select value={algo} onChange={(e) => setAlgo(e.target.value as TotpAlgo)} style={{ width: 'auto' }}>
            <option value="SHA-1">SHA-1</option>
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-512">SHA-512</option>
          </select>
        </label>
        <FileButton accept="image/*" onFile={(f) => void fromQr(f)}>
          {t('fromQr')}
        </FileButton>
        <button type="button" className="btn ghost sm" onClick={() => onSecret(SAMPLE)}>
          {t('sample')}
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setSecretInput('')
            setMeta({})
          }}
          disabled={!secretInput}
        >
          {c('common.clear')}
        </button>
      </div>

      {qrErr ? <Notice kind="err">{t('qrFail')}</Notice> : null}
      {secretInput && !valid ? <Notice kind="err">{t('invalid')}</Notice> : null}
      {valid && secret.length < 16 ? <Notice kind="warn">{t('weak')}</Notice> : null}

      <section aria-label={t('current')}>
        <div style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '18px 0' }}>
          {codes ? (
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>
                  {t('current')}
                </div>
                <div className="readout" aria-live="off">
                  {group(codes.cur)}
                </div>
              </div>
              <CopyButton text={codes.cur} small={false} />
            </div>
          ) : (
            <p className="hint">{t('empty')}</p>
          )}
        </div>
        <div className="countdown" aria-hidden="true">
          {codes ? (
            <i
              style={{
                transform: `scaleX(${Math.max(0, 1 - elapsed / period).toFixed(3)})`,
                transition: elapsed < 0.4 ? 'none' : 'transform 260ms linear',
              }}
            />
          ) : null}
        </div>
        {codes ? (
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span className="hint" role="timer" aria-live="off">
              {t('refresh', { n: left })}
            </span>
            <span className="hint">
              {t('next')} <span className="mono">{group(codes.next)}</span>
            </span>
          </div>
        ) : null}
      </section>

      {meta.issuer || meta.account ? (
        <Kv
          rows={[
            ...(meta.issuer ? ([[t('issuer'), meta.issuer]] as [string, string][]) : []),
            ...(meta.account ? ([[t('account'), meta.account]] as [string, string][]) : []),
          ]}
        />
      ) : null}

      <p className="hint">{t('privacy')}</p>
    </div>
  )
}
