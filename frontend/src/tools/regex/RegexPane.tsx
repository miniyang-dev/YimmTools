import { useMemo, useState, type ReactNode } from 'react'
import { useStrings } from '../../i18n'
import { Field, Notice } from '../../ui'
import { MAX_MATCHES, runRegex } from './engine'
import { strings } from './strings'

const FLAGS = ['g', 'i', 'm', 's', 'u']
const SHOWN_MATCHES = 100

export function RegexPane() {
  const t = useStrings(strings)
  const [pattern, setPattern] = useState('(\\d{4})-(\\d{2})-(\\d{2})')
  const [flags, setFlags] = useState('g')
  const [subject, setSubject] = useState('Release 2025-01-31, hotfix 2025-02-14.')
  const [replacement, setReplacement] = useState('')

  const result = useMemo(() => runRegex(pattern, flags, subject, replacement), [pattern, flags, subject, replacement])
  const toggle = (f: string) => setFlags((cur) => (cur.includes(f) ? cur.replace(f, '') : cur + f))

  return (
    <>
      <Field label={t('pattern')}>
        <input
          type="text"
          className="mono"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={t('patternPlaceholder')}
          spellCheck={false}
        />
      </Field>
      <div className="row">
        <span className="label">{t('flags')}</span>
        {FLAGS.map((f) => (
          <label className="check" key={f}>
            <input type="checkbox" checked={flags.includes(f)} onChange={() => toggle(f)} />
            <code>{f}</code>
          </label>
        ))}
      </div>
      <Field label={t('subject')}>
        <textarea
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t('subjectPlaceholder')}
          rows={6}
          spellCheck={false}
        />
      </Field>
      <Field label={t('replace')}>
        <input
          type="text"
          className="mono"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          spellCheck={false}
        />
      </Field>

      {result?.kind === 'error' ? <Notice kind="err">{t('badPattern', { msg: result.error })}</Notice> : null}
      {result?.kind === 'ok' ? (
        <>
          <pre className="out">
            <Highlighted subject={subject} matches={result.matches} />
          </pre>
          <h2 className="section-title">{t('matches', { n: result.matches.length })}</h2>
          {result.truncated ? <Notice kind="warn">{t('tooMany', { n: MAX_MATCHES })}</Notice> : null}
          <MatchTable matches={result.matches} />
          {result.replaced !== null ? (
            <div className="field">
              <span className="label">{t('preview')}</span>
              <pre className="out">{result.replaced}</pre>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  )
}

function Highlighted({ subject, matches }: { subject: string; matches: RegExpExecArray[] }) {
  const pieces: ReactNode[] = []
  let last = 0
  matches.forEach((m, i) => {
    const start = m.index ?? 0
    if (start < last) return
    pieces.push(subject.slice(last, start))
    pieces.push(
      <mark
        key={i}
        style={{
          background: 'color-mix(in srgb, var(--red) 24%, transparent)',
          color: 'inherit',
          outline: '1px solid var(--red)',
        }}
      >
        {m[0]}
      </mark>,
    )
    last = start + m[0].length
  })
  pieces.push(subject.slice(last))
  return <>{pieces}</>
}

function MatchTable({ matches }: { matches: RegExpExecArray[] }) {
  const t = useStrings(strings)
  if (matches.length === 0) return <p className="hint">{t('noMatch')}</p>
  return (
    <table className="tbl">
      <tbody>
        {matches.slice(0, SHOWN_MATCHES).map((m, i) => (
          <tr key={i}>
            <td style={{ width: 90 }} className="hint">
              {t('at', { i: m.index ?? 0 })}
            </td>
            <td>
              <code>{m[0] === '' ? '∅' : m[0]}</code>
              {m.slice(1).map((g, gi) => (
                <div key={gi} className="hint">
                  {t('group', { n: gi + 1 })}: <code>{g ?? 'undefined'}</code>
                </div>
              ))}
              {m.groups ? (
                <div className="hint">
                  {t('named')}: <code>{JSON.stringify(m.groups)}</code>
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
