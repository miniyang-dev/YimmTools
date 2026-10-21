import { useEffect, useMemo, useState } from 'react'
import { useLang, useStrings, useT, type Strings } from '../../i18n'
import { CodeArea, Field, Notice, Output, OutputField, useSpan } from '../../ui'
import { decodeJwt, JWT_TIME_CLAIMS, b64urlToBytes } from '../../lib/jwt'
import raw from './strings.json'

const strings = raw as unknown as Strings
const HS: Record<string, 'SHA-256' | 'SHA-384' | 'SHA-512'> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }

export default function JwtTool() {
  const t = useStrings(strings)
  const c = useT()
  const lang = useLang()
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [verdict, setVerdict] = useState<'ok' | 'bad' | null>(null)

  const decoded = useMemo(() => (token.trim() ? decodeJwt(token) : null), [token])

  useEffect(() => {
    setVerdict(null)
    if (!decoded || !decoded.ok || !secret) return
    const algo = decoded.jwt.alg ? HS[decoded.jwt.alg] : undefined
    if (!algo) return
    let alive = true
    ;(async () => {
      const parts = token
        .trim()
        .replace(/^Bearer\s+/i, '')
        .split('.')
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: algo },
        false,
        ['verify'],
      )
      const ok = await crypto.subtle.verify(
        'HMAC',
        key,
        b64urlToBytes(parts[2] ?? '') as BufferSource,
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      )
      if (alive) setVerdict(ok ? 'ok' : 'bad')
    })().catch(() => alive && setVerdict('bad'))
    return () => {
      alive = false
    }
  }, [decoded, secret, token])

  const span = useSpan()

  const fmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'medium' })
  const nowSec = Date.now() / 1000

  const pretty = (v: unknown) => JSON.stringify(v, null, 2)
  const jwt = decoded && decoded.ok ? decoded.jwt : null
  const errKey =
    decoded && !decoded.ok ? { parts: 'errParts', header: 'errHeader', payload: 'errPayload' }[decoded.error] : null

  return (
    <div className="stack">
      <Field label={t('token')}>
        <CodeArea
          wrap
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t('placeholder')}
          rows={5}
          autoComplete="off"
        />
      </Field>
      <div>
        <button type="button" className="btn ghost sm" onClick={() => setToken('')} disabled={!token}>
          {c('common.clear')}
        </button>
      </div>

      {errKey ? <Notice kind="err">{t(errKey)}</Notice> : null}

      {jwt ? (
        <>
          {jwt.alg?.toLowerCase() === 'none' ? <Notice kind="err">{t('noneAlg')}</Notice> : null}
          <div className="grid2">
            <OutputField label={t('header')} value={pretty(jwt.header)} />
            <OutputField label={t('payload')} value={pretty(jwt.payload)} />
          </div>

          {JWT_TIME_CLAIMS.some((k) => typeof jwt.payload[k] === 'number') ? (
            <section>
              <h2 className="section-title">{t('times')}</h2>
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">{t('claim')}</th>
                    <th scope="col">{t('when')}</th>
                    <th scope="col">{t('rel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {JWT_TIME_CLAIMS.filter((k) => typeof jwt.payload[k] === 'number').map((k) => {
                    const v = jwt.payload[k] as number
                    const diff = v - nowSec
                    let rel: string
                    if (k === 'exp') rel = diff < 0 ? t('expired', { t: span(diff) }) : t('valid', { t: span(diff) })
                    else if (k === 'nbf' && diff > 0) rel = t('notYet', { t: span(diff) })
                    else rel = diff < 0 ? t('ago', { t: span(diff) }) : t('future', { t: span(diff) })
                    return (
                      <tr key={k}>
                        <th scope="row" style={{ fontWeight: 500 }}>
                          <code>{k}</code>
                        </th>
                        <td>{fmt.format(new Date(v * 1000))}</td>
                        <td style={k === 'exp' && diff < 0 ? { color: 'var(--red)', fontWeight: 600 } : undefined}>
                          {rel}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          ) : null}

          <div className="field">
            <span className="label">{t('signature')}</span>
            <Output value={jwt.signature} placeholder={t('noSig')} />
          </div>

          <section className="stack">
            <h2 className="section-title">{t('verify')}</h2>
            {jwt.alg && HS[jwt.alg] ? (
              <>
                <Field label={t('secret')}>
                  <input
                    type="text"
                    className="mono"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                {verdict === 'ok' ? <Notice kind="ok">{t('verifyOk')}</Notice> : null}
                {verdict === 'bad' ? <Notice kind="err">{t('verifyBad')}</Notice> : null}
                {verdict === null ? <Notice kind="warn">{t('notVerified')}</Notice> : null}
              </>
            ) : (
              <>
                <p className="hint">{t('verifyUnsupported', { alg: jwt.alg ?? '?' })}</p>
                <Notice kind="warn">{t('notVerified')}</Notice>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
