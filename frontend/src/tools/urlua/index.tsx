import { useMemo, useState } from 'react'
import { UAParser } from 'ua-parser-js'
import { useStrings, type Strings } from '../../i18n'
import { CopyButton, Field, Kv, Notice } from '../../ui'
import raw from './strings.json'

const strings = raw as unknown as Strings

export default function UrlUaTool() {
  return (
    <div className="stack" style={{ gap: 36 }}>
      <UrlPane />
      <UaPane />
    </div>
  )
}

function UrlPane() {
  const t = useStrings(strings)
  const [text, setText] = useState('')
  const parsed = useMemo(() => {
    const s = text.trim()
    if (!s) return null
    try {
      return new URL(s)
    } catch {
      return 'bad' as const
    }
  }, [text])

  return (
    <section className="stack">
      <Field label={t('url')}>
        <input
          type="text"
          className="mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('urlPlaceholder')}
          spellCheck={false}
        />
      </Field>
      {parsed === 'bad' ? <Notice kind="err">{t('badUrl')}</Notice> : null}
      {parsed && parsed !== 'bad' ? (
        <>
          <Kv
            rows={[
              [t('protocol'), parsed.protocol, true],
              [t('user'), parsed.username ? decodeURIComponent(parsed.username) : '—', true],
              [t('hostname'), parsed.hostname, true],
              [
                t('port'),
                parsed.port ||
                  `${parsed.protocol === 'https:' ? 443 : parsed.protocol === 'http:' ? 80 : ''} ${t('defaultPort')}`,
                true,
              ],
              [t('origin'), parsed.origin, true],
              [t('path'), safeDecode(parsed.pathname), true],
              [t('search'), parsed.search || '—', true],
              [t('hash'), parsed.hash || '—', true],
            ]}
          />
          <h2 className="section-title">{t('params')}</h2>
          {Array.from(parsed.searchParams).length === 0 ? (
            <p className="hint">{t('noParams')}</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">{t('key')}</th>
                  <th scope="col">{t('value')}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(parsed.searchParams).map(([k, v], i) => (
                  <tr key={i}>
                    <td>
                      <code>{k}</code>
                    </td>
                    <td>
                      <code>{v}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </section>
  )
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function UaPane() {
  const t = useStrings(strings)
  const [ua, setUa] = useState('')
  const r = useMemo(() => (ua.trim() ? new UAParser(ua).getResult() : null), [ua])
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ') || t('unknown')

  return (
    <section className="stack">
      <h2 className="section-title">{t('ua')}</h2>
      <Field label={t('ua')}>
        <textarea
          value={ua}
          onChange={(e) => setUa(e.target.value)}
          placeholder={t('uaPlaceholder')}
          rows={3}
          spellCheck={false}
        />
      </Field>
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={() => setUa(navigator.userAgent)}>
          {t('useMine')}
        </button>
        <CopyButton text={ua} />
      </div>
      {r ? (
        <>
          <Kv
            rows={[
              [t('browser'), join(r.browser.name, r.browser.version)],
              [t('engine'), join(r.engine.name, r.engine.version)],
              [t('os'), join(r.os.name, r.os.version)],
              [t('device'), join(r.device.vendor, r.device.model, r.device.type)],
              [t('cpu'), join(r.cpu.architecture)],
            ]}
          />
          <p className="hint">{t('uaNote')}</p>
        </>
      ) : null}
    </section>
  )
}
