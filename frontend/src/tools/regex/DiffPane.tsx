import { useMemo, useState } from 'react'
import { useStrings } from '../../i18n'
import { CodeArea, Field, Notice, Seg } from '../../ui'
import { computeDiff, type DiffMode } from './engine'
import { strings } from './strings'

export function DiffPane() {
  const t = useStrings(strings)
  const [a, setA] = useState('The quick brown fox\njumps over the lazy dog.\nSame last line.')
  const [b, setB] = useState('The quick red fox\njumps over the sleepy dog.\nSame last line.')
  const [mode, setMode] = useState<DiffMode>('words')
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)

  const { parts, added, removed } = useMemo(
    () => computeDiff(a, b, { mode, ignoreCase, ignoreWhitespace }),
    [a, b, mode, ignoreCase, ignoreWhitespace],
  )

  return (
    <>
      <div className="grid2">
        <Field label={t('fA')}>
          <CodeArea wrap value={a} onChange={(e) => setA(e.target.value)} rows={8} />
        </Field>
        <Field label={t('fB')}>
          <CodeArea wrap value={b} onChange={(e) => setB(e.target.value)} rows={8} />
        </Field>
      </div>
      <div className="row" style={{ gap: 18 }}>
        <Seg
          label={t('mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'lines', label: t('lines') },
            { value: 'words', label: t('words') },
            { value: 'chars', label: t('chars') },
          ]}
        />
        <label className="check">
          <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} />
          {t('ignoreCase')}
        </label>
        <label className="check">
          <input type="checkbox" checked={ignoreWhitespace} onChange={(e) => setIgnoreWhitespace(e.target.checked)} />
          {t('ignoreWs')}
        </label>
      </div>
      <h2 className="section-title">
        {t('result')} · <span style={{ color: 'var(--ok)' }}>{t('added', { n: added })}</span> ·{' '}
        <span style={{ color: 'var(--red)' }}>{t('removed', { n: removed })}</span>
      </h2>
      {added === 0 && removed === 0 ? (
        <Notice kind="ok">{t('same')}</Notice>
      ) : (
        <pre className="out">
          {parts.map((p, i) => (
            <span key={i} className={p.added ? 'diff-add' : p.removed ? 'diff-del' : undefined}>
              {p.value}
            </span>
          ))}
        </pre>
      )}
    </>
  )
}
