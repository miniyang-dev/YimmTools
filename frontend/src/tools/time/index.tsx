import { useMemo, useState } from 'react'
import cronstrue from 'cronstrue/i18n'
import parser from 'cron-parser'
import { useLang, useStrings, type Strings } from '../../i18n'
import { parseTimeInput } from '../../lib/time'
import { CopyButton, Field, Kv, Notice, Seg, useNow, useSpan } from '../../ui'
import raw from './strings.json'

const strings = raw as unknown as Strings
const CRON_LOCALE = { 'zh-TW': 'zh_TW', 'zh-CN': 'zh_CN', en: 'en', es: 'es', ja: 'ja' } as const
const ZONES = [
  'UTC',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Australia/Sydney',
]
const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone

export default function TimeTool() {
  const t = useStrings(strings)
  const [tab, setTab] = useState<'ts' | 'cron'>('ts')
  const [zone, setZone] = useState('local')
  const realZone = zone === 'local' ? LOCAL : zone
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Seg
          label="mode"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ts', label: t('tabTs') },
            { value: 'cron', label: t('tabCron') },
          ]}
        />
        <label className="row" style={{ gap: 8 }}>
          <span className="label">{t('zone')}</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)} style={{ width: 'auto' }}>
            <option value="local">
              {t('local')} ({LOCAL})
            </option>
            {ZONES.filter((z) => z !== LOCAL).map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* both panes stay mounted so switching tabs never loses what was typed */}
      <div className="stack" hidden={tab !== 'ts'}>
        <Timestamp zone={realZone} />
      </div>
      <div className="stack" hidden={tab !== 'cron'}>
        <Cron zone={realZone} />
      </div>
    </div>
  )
}

function Timestamp({ zone }: { zone: string }) {
  const t = useStrings(strings)
  const lang = useLang()
  const span = useSpan()
  const now = useNow(1000)
  const [text, setText] = useState('')

  const parsed = useMemo(() => parseTimeInput(text, zone), [text, zone])

  const valid = parsed && Number.isFinite(parsed.ms) && Math.abs(parsed.ms) < 8.64e15
  const fmt = (ms: number, tz: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'long', timeZone: tz }).format(new Date(ms))

  return (
    <>
      <div className="stack" style={{ borderBottom: '1px solid var(--hair)', paddingBottom: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label">{t('now')}</span>
          <span className="mono">
            {Math.floor(now / 1000)} · {now}
          </span>
        </div>
      </div>
      <Field label={t('input')} hint={t('inputHint')}>
        <input
          type="text"
          className="mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          spellCheck={false}
        />
      </Field>
      <div>
        <button type="button" className="btn ghost sm" onClick={() => setText(String(Math.floor(Date.now() / 1000)))}>
          {t('useNow')}
        </button>
      </div>
      {parsed && !valid ? <Notice kind="err">{t('bad')}</Notice> : null}
      {valid ? (
        <>
          {parsed.unit ? <p className="hint">{parsed.unit === 'ms' ? t('unitMs') : t('unitSec')}</p> : null}
          <Kv
            rows={[
              [t('rowSec'), Math.floor(parsed.ms / 1000), true],
              [t('rowMs'), parsed.ms, true],
              [t('rowIso'), new Date(parsed.ms).toISOString(), true],
              [t('rowZone'), fmt(parsed.ms, zone)],
              [
                t('rowRel'),
                parsed.ms - now >= 0
                  ? t('future', { t: span((parsed.ms - now) / 1000) })
                  : t('past', { t: span((parsed.ms - now) / 1000) }),
              ],
            ]}
          />
          <div className="row">
            <CopyButton text={String(Math.floor(parsed.ms / 1000))} label={t('rowSec')} />
            <CopyButton text={String(parsed.ms)} label={t('rowMs')} />
            <CopyButton text={new Date(parsed.ms).toISOString()} label="ISO" />
          </div>
        </>
      ) : null}
    </>
  )
}

function Cron({ zone }: { zone: string }) {
  const t = useStrings(strings)
  const lang = useLang()
  const [expr, setExpr] = useState('*/15 9-17 * * 1-5')

  const result = useMemo(() => {
    const e = expr.trim().replace(/\s+/g, ' ')
    if (!e) return null
    try {
      const text = cronstrue.toString(e, { locale: CRON_LOCALE[lang], use24HourTimeFormat: true })
      const it = parser.parseExpression(e, { tz: zone })
      const runs = Array.from({ length: 6 }, () => it.next().toDate())
      return { text, runs }
    } catch {
      return { text: '', runs: [] as Date[], bad: true }
    }
  }, [expr, lang, zone])

  const fmt = new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'medium', timeZone: zone })

  return (
    <>
      <Field label={t('cron')} hint={t('cronHint')}>
        <input
          type="text"
          className="mono"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder={t('cronSample')}
          spellCheck={false}
        />
      </Field>
      {result && 'bad' in result ? <Notice kind="err">{t('cronBad')}</Notice> : null}
      {result && !('bad' in result) ? (
        <>
          <section>
            <h2 className="section-title">{t('meaning')}</h2>
            <p style={{ fontSize: '1.1875rem', marginTop: 10 }}>{result.text}</p>
          </section>
          <section>
            <h2 className="section-title">{t('next', { n: result.runs.length, zone })}</h2>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', borderTop: 0 }}>
              {result.runs.map((d, i) => (
                <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--hair)' }}>
                  {fmt.format(d)}
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </>
  )
}
