import { useDeferredValue, useMemo, useState } from 'react'
import { useStrings, type Strings } from '../../i18n'
import { CopyButton, Field, Notice } from '../../ui'
import {
  contrast,
  formatHex,
  formatHsl,
  formatOklch,
  formatRatio,
  formatRgb,
  LEVELS,
  nearestPassing,
  parseColor,
  type Rgba,
} from './color'
import raw from './strings.json'

const strings = raw as unknown as Strings

/** Our own parser first; named colours, lab(), color() … are left to the browser, read back through a canvas. */
function resolve(input: string): Rgba | null {
  const own = parseColor(input)
  if (own) return own
  const s = input.trim()
  if (!s || typeof CSS === 'undefined' || !CSS.supports('color', s)) return null
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = s
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 }
}

const css = (c: Rgba) => formatRgb(c)
const opaqueHex = (c: Rgba) => formatHex({ ...c, a: 1 })

export default function ColorTool() {
  const t = useStrings(strings)
  const [fgText, setFgText] = useState('#b02a1b')
  const [bgText, setBgText] = useState('#ffffff')
  const fgInput = useDeferredValue(fgText)
  const bgInput = useDeferredValue(bgText)
  const fg = useMemo(() => resolve(fgInput), [fgInput])
  const bg = useMemo(() => resolve(bgInput), [bgInput])

  return (
    <div className="stack">
      <ColorInput label={t('color')} hint={t('colorHint')} value={fgText} onChange={setFgText} color={fg} />
      {fg ? (
        <>
          <div className="swatch" aria-hidden="true">
            <i style={{ background: css(fg) }} />
          </div>
          <FormatList color={fg} />
        </>
      ) : fgInput.trim() ? (
        <Notice kind="err">{t('bad')}</Notice>
      ) : null}

      <h2 className="section-title">{t('contrast')}</h2>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <span className="label">{t('fg')}</span>
          <p className="hint">
            {fg ? (
              <>
                <span className="chip" style={{ background: css(fg) }} aria-hidden="true" />{' '}
                <code>{formatHex(fg)}</code>
                {' · '}
              </>
            ) : null}
            {t('fgIsAbove')}
          </p>
        </div>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setFgText(bgText)
            setBgText(fgText)
          }}
        >
          ⇄ {t('swap')}
        </button>
      </div>
      <ColorInput label={t('bg')} value={bgText} onChange={setBgText} color={bg} />
      {bgInput.trim() && !bg ? <Notice kind="err">{t('bad')}</Notice> : null}
      {fg && bg ? <Contrast fg={fg} bg={bg} onApply={(c) => setFgText(formatHex(c))} /> : null}
    </div>
  )
}

function ColorInput({
  label,
  hint,
  value,
  onChange,
  color,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  color: Rgba | null
}) {
  const t = useStrings(strings)
  return (
    <div className="color-input">
      <Field label={label} hint={hint}>
        <input
          type="text"
          className="mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </Field>
      {/* the native picker only knows opaque #rrggbb */}
      <input
        type="color"
        aria-label={`${label} — ${t('pick')}`}
        value={color ? opaqueHex(color) : '#000000'}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function FormatList({ color }: { color: Rgba }) {
  const rows: [string, string][] = [
    ['HEX', formatHex(color)],
    ['RGB', formatRgb(color)],
    ['HSL', formatHsl(color)],
    ['OKLCH', formatOklch(color)],
  ]
  return (
    <ul className="formats">
      {rows.map(([name, value]) => (
        <li key={name}>
          <span className="label">{name}</span>
          <code>{value}</code>
          <CopyButton text={value} />
        </li>
      ))}
    </ul>
  )
}

function Contrast({ fg, bg, onApply }: { fg: Rgba; bg: Rgba; onApply: (c: Rgba) => void }) {
  const t = useStrings(strings)
  const ratio = contrast(fg, bg)
  // suggest for the first level missed: AA for body text, then AAA
  const goal = ratio < 4.5 ? { id: 'aaNormal', min: 4.5 } : ratio < 7 ? { id: 'aaaNormal', min: 7 } : null
  const fix = goal ? nearestPassing(fg, bg, goal.min) : null

  return (
    <>
      <div className="contrast-preview" style={{ color: css(fg), background: css(bg) }}>
        <p className="big">{t('sampleLarge')}</p>
        <p>{t('sample')}</p>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 14 }}>
        <span className="readout" data-testid="ratio">
          {formatRatio(ratio)}
        </span>
        <span className="label">{t('ratio')}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">{t('level')}</th>
            <th scope="col">{t('need')}</th>
            <th scope="col">{t('result')}</th>
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((level) => {
            const ok = ratio >= level.min
            return (
              <tr key={level.id}>
                <td>{t(level.id)}</td>
                <td className="mono">{level.min}:1</td>
                <td className={ok ? 'pass' : 'fail'}>{ok ? t('pass') : t('fail')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="hint">{t('largeHint')}</p>
      {bg.a < 1 ? <p className="hint">{t('alphaNote')}</p> : null}
      {goal && fix ? (
        <Notice kind="warn">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {t('suggest', { level: t(goal.id) })}{' '}
              <span className="chip" style={{ background: css(fix) }} aria-hidden="true" />{' '}
              <code>{formatHex(fix)}</code> <span className="hint">({formatRatio(contrast(fix, bg))})</span>
            </span>
            <button type="button" className="btn ghost sm" onClick={() => onApply(fix)}>
              {t('apply')}
            </button>
          </div>
        </Notice>
      ) : null}
    </>
  )
}
