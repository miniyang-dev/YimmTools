import { useMemo, useRef, useState } from 'react'
import { useStrings, useT, type Strings } from '../../i18n'
import { CodeArea, Field, Notice, OutputField, Seg, focusAt } from '../../ui'
import { ConvertError, convert, type Format } from '../../lib/convert'
import raw from './strings.json'

const strings = raw as unknown as Strings
const ERROR_KEYS = { json: 'errJson', yaml: 'errYaml', csv: 'errCsv', 'csv-shape': 'errShape' } as const

interface Failure {
  message: string
  offset?: number
  line?: number
}

const FORMATS: { value: Format; label: string }[] = [
  { value: 'yaml', label: 'YAML' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
]

export default function ConvertTool() {
  const t = useStrings(strings)
  const c = useT()
  const [from, setFrom] = useState<Format>('yaml')
  const [to, setTo] = useState<Format>('json')
  const [text, setText] = useState('')
  const [delimiter, setDelimiter] = useState(',')
  const [header, setHeader] = useState(true)
  const [indent, setIndent] = useState(2)
  const area = useRef<HTMLTextAreaElement>(null)

  const result = useMemo((): { out: string; error: Failure | null } => {
    try {
      return { out: convert(text, from, to, { indent, csvHeader: header, csvDelimiter: delimiter }), error: null }
    } catch (e) {
      if (!(e instanceof ConvertError)) return { out: '', error: { message: t('errCsv', { msg: String(e) }) } }
      return {
        out: '',
        error: { message: t(ERROR_KEYS[e.kind], { msg: e.message }), offset: e.offset, line: e.line },
      }
    }
  }, [text, from, to, delimiter, header, indent, t])
  const error = result.error

  // Picking the format already used on the other side moves that side to the remaining one.
  const pick = (setSelf: (f: Format) => void, other: Format, setOther: (f: Format) => void) => (f: Format) => {
    setSelf(f)
    if (f === other) setOther(FORMATS.find((x) => x.value !== f && x.value !== other)?.value ?? 'json')
  }

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'end' }}>
        <div className="field">
          <span className="label">{t('from')}</span>
          <Seg label={t('from')} value={from} options={FORMATS} onChange={pick(setFrom, to, setTo)} />
        </div>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setFrom(to)
            setTo(from)
            if (result.out) setText(result.out)
          }}
        >
          ⇄ {t('swap')}
        </button>
        <div className="field">
          <span className="label">{t('to')}</span>
          <Seg label={t('to')} value={to} options={FORMATS} onChange={pick(setTo, from, setFrom)} />
        </div>
      </div>

      <Field label={t('input')}>
        <CodeArea
          ref={area}
          value={text}
          markLine={error?.line}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          rows={10}
        />
      </Field>

      <div className="row">
        {from === 'csv' || to === 'csv' ? (
          <>
            <label className="row" style={{ gap: 8 }}>
              <span className="label">{t('delimiter')}</span>
              <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)} style={{ width: 'auto' }}>
                <option value=",">{t('comma')}</option>
                <option value=";">{t('semicolon')}</option>
                <option value={'\t'}>{t('tab')}</option>
                <option value="|">{t('pipe')}</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
              {t('header')}
            </label>
          </>
        ) : null}
        {to !== 'csv' ? (
          <label className="row" style={{ gap: 8 }}>
            <span className="label">{t('indent')}</span>
            <select value={indent} onChange={(e) => setIndent(Number(e.target.value))} style={{ width: 'auto' }}>
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </label>
        ) : null}
        <button type="button" className="btn ghost sm" onClick={() => setText('')} disabled={!text}>
          {c('common.clear')}
        </button>
      </div>

      {error ? (
        <Notice kind="err">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>{error.message}</span>
            {error.line !== undefined && error.offset !== undefined ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => area.current && focusAt(area.current, error.offset!, error.line!)}
              >
                {t('goto', { line: error.line })}
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      <OutputField label={c('common.output')} value={result.out} placeholder={t('emptyOut')} />
    </div>
  )
}
