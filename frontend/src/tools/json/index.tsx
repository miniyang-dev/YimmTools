import { useMemo, useRef, useState } from 'react'
import { useStrings, useT, type Strings } from '../../i18n'
import { CodeArea, Field, Notice, OutputField, Seg, focusAt } from '../../ui'
import { formatJson } from '../../lib/json-lossless'
import { locate, missingCommaAt, parseJson } from '../../lib/text'
import raw from './strings.json'

const strings = raw as unknown as Strings
const SAMPLE = '{"user":{"name":"Yimm","roles":["admin","dev"],"active":true},"retries":3,"ratio":0.75}'
const INDENTS = { '2': '  ', '4': '    ', tab: '\t' } as const

const byteLength = (s: string) => new TextEncoder().encode(s).length

interface ErrorSpot {
  /** 0-based offset to put the caret at */
  offset: number
  line: number
  column: number
  /** the parser's position was moved back to where the comma is missing */
  missingComma: boolean
}

export default function JsonTool() {
  const t = useStrings(strings)
  const c = useT()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'format' | 'minify'>('format')
  const [indent, setIndent] = useState<keyof typeof INDENTS>('2')
  const [sort, setSort] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  const result = useMemo(() => {
    if (!text.trim()) return null
    const parsed = parseJson(text)
    if (!parsed.ok) return parsed
    const out = formatJson(text, { indent: mode === 'minify' ? '' : INDENTS[indent], sortKeys: sort })
    return { ok: true as const, out }
  }, [text, mode, indent, sort])

  const spot = useMemo((): ErrorSpot | null => {
    if (!result || result.ok || result.position === undefined) return null
    const comma = missingCommaAt(text, result.position)
    const offset = comma ?? result.position
    return { offset, ...locate(text, offset), missingComma: comma !== null }
  }, [result, text])

  const goTo = (s: ErrorSpot) => area.current && focusAt(area.current, s.offset, s.line)

  let errorContext: string | null = null
  if (spot) {
    const line = text.split('\n')[spot.line - 1] ?? ''
    errorContext = `${line}\n${' '.repeat(Math.max(spot.column - 1, 0))}^`
  }
  const output = result && result.ok ? result.out : ''

  return (
    <div className="stack">
      <Field label={t('input')}>
        <CodeArea
          ref={area}
          value={text}
          markLine={spot?.line}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          rows={12}
        />
      </Field>
      <div className="row">
        <Seg
          label={t('format')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'format', label: t('format') },
            { value: 'minify', label: t('minify') },
          ]}
        />
        {mode === 'format' ? (
          <Seg
            label={t('indent')}
            value={indent}
            onChange={setIndent}
            options={[
              { value: '2', label: '2' },
              { value: '4', label: '4' },
              { value: 'tab', label: t('tab') },
            ]}
          />
        ) : null}
        <label className="check">
          <input type="checkbox" checked={sort} onChange={(e) => setSort(e.target.checked)} />
          {t('sort')}
        </label>
        <button type="button" className="btn ghost sm" onClick={() => setText(SAMPLE)}>
          {c('common.sample')}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setText('')} disabled={!text}>
          {c('common.clear')}
        </button>
      </div>

      {result && !result.ok ? (
        <Notice kind="err">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>
              {spot
                ? spot.missingComma
                  ? t('missingComma', { line: spot.line })
                  : t('errorAt', { line: spot.line, col: spot.column })
                : t('errorGeneric')}
            </strong>
            {spot ? (
              <button type="button" className="btn ghost sm" onClick={() => goTo(spot)}>
                {t('goto', { line: spot.line })}
              </button>
            ) : null}
          </div>
          {errorContext ? (
            <pre className="mono" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
              {errorContext}
            </pre>
          ) : null}
        </Notice>
      ) : null}
      {result && result.ok ? (
        <Notice kind="ok">
          {t('valid')} · {t('size', { from: byteLength(text), to: byteLength(result.out) })}
        </Notice>
      ) : null}

      <OutputField label={c('common.output')} value={output} placeholder={t('emptyOut')} />
    </div>
  )
}
