import { useDeferredValue, useMemo, useState } from 'react'
import { useLang, useStrings, useT, type Strings } from '../../i18n'
import { Field, Kv, OutputField, Seg, useSpan } from '../../ui'
import { convertCase, textStats, type CaseMode } from './text'
import raw from './strings.json'

const strings = raw as unknown as Strings

// identifier styles are spelled the same in every language: the label is the example
const NAMING: { value: CaseMode; label: string }[] = [
  { value: 'camel', label: 'camelCase' },
  { value: 'pascal', label: 'PascalCase' },
  { value: 'snake', label: 'snake_case' },
  { value: 'kebab', label: 'kebab-case' },
  { value: 'constant', label: 'CONSTANT_CASE' },
]

export default function TextTool() {
  const t = useStrings(strings)
  const c = useT()
  const lang = useLang()
  const span = useSpan()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<CaseMode>('upper')
  const source = useDeferredValue(text) // long pastes must not make typing lag

  const stats = useMemo(() => textStats(source), [source])
  const out = useMemo(() => (source ? convertCase(source, mode) : ''), [source, mode])
  const n = (x: number) => x.toLocaleString(lang)

  const figures: [string, string][] = [
    [t('words'), n(stats.words)],
    [t('chars'), n(stats.chars)],
    [t('charsNoSpace'), n(stats.charsNoSpace)],
    [t('read'), stats.readSeconds ? span(Math.max(stats.readSeconds, 1)) : '—'],
  ]

  return (
    <div className="stack">
      <Field label={t('input')}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} rows={8} />
      </Field>

      <dl className="figures">
        {figures.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <Kv
        rows={[
          [t('cjk'), n(stats.cjk), true],
          [t('latinWords'), n(stats.latinWords), true],
          [t('lines'), n(stats.lines), true],
          [t('paragraphs'), n(stats.paragraphs), true],
          [t('bytes'), n(stats.utf8Bytes), true],
        ]}
        compact
      />
      <p className="hint">{t('wordsHint')}</p>

      <h2 className="section-title">{t('convert')}</h2>
      <div className="stack" style={{ gap: 12 }}>
        <CaseGroup
          label={t('case')}
          mode={mode}
          onChange={setMode}
          options={[
            { value: 'upper', label: t('upper') },
            { value: 'lower', label: t('lower') },
            { value: 'title', label: t('title') },
            { value: 'sentence', label: t('sentence') },
          ]}
        />
        <CaseGroup label={t('naming')} mode={mode} onChange={setMode} options={NAMING} />
        <CaseGroup
          label={t('width')}
          mode={mode}
          onChange={setMode}
          options={[
            { value: 'halfwidth', label: t('halfwidth') },
            { value: 'fullwidth', label: t('fullwidth') },
          ]}
        />
        {NAMING.some((o) => o.value === mode) ? <p className="hint">{t('namingHint')}</p> : null}
      </div>

      <OutputField
        label={c('common.output')}
        value={out}
        placeholder={t('emptyOut')}
        actions={
          <button type="button" className="btn ghost sm" disabled={!out || out === text} onClick={() => setText(out)}>
            ↑ {c('common.input')}
          </button>
        }
      />
    </div>
  )
}

/** One labelled row of conversions; all rows share one selection. */
function CaseGroup({
  label,
  mode,
  onChange,
  options,
}: {
  label: string
  mode: CaseMode
  onChange: (m: CaseMode) => void
  options: { value: CaseMode; label: string }[]
}) {
  return (
    <div className="row">
      <span className="label" style={{ minWidth: '5.5em' }}>
        {label}
      </span>
      <Seg label={label} value={mode} onChange={onChange} options={options} fill />
    </div>
  )
}
