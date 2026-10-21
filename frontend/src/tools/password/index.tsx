import { useCallback, useState } from 'react'
import { useStrings, type Strings } from '../../i18n'
import { CopyList, Notice, Seg } from '../../ui'
import { entropyBits, generatePassword, uuidV4, uuidV7, type PasswordOptions } from '../../lib/password'
import raw from './strings.json'
import { useGenerated } from './useGenerated'

const strings = raw as unknown as Strings
const COUNTS = [1, 5, 10, 20]
const CLASSES = ['lower', 'upper', 'digits', 'symbols'] as const

export default function PasswordTool() {
  const t = useStrings(strings)
  const [tab, setTab] = useState<'password' | 'uuid'>('password')
  return (
    <div className="stack">
      <Seg
        label="mode"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'password', label: t('tabPassword') },
          { value: 'uuid', label: t('tabUuid') },
        ]}
      />
      {tab === 'password' ? <Passwords /> : <Uuids />}
      <p className="hint">{t('note')}</p>
    </div>
  )
}

function CountSelect({ value, onChange, style }: { value: number; onChange: (n: number) => void; style?: object }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={style}>
      {COUNTS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}

const strengthKey = (bits: number) => (bits < 50 ? 's1' : bits < 70 ? 's2' : bits < 100 ? 's3' : 's4')

function Passwords() {
  const t = useStrings(strings)
  const [o, setO] = useState<PasswordOptions>({
    length: 20,
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
    avoidAmbiguous: false,
  })
  const [count, setCount] = useState(5)
  const generate = useCallback(() => Array.from({ length: count }, () => generatePassword(o)), [o, count])
  const [list, regenerate] = useGenerated(generate)

  const bits = Math.round(entropyBits(o))
  const noClass = CLASSES.every((k) => !o[k])
  const set = (k: keyof PasswordOptions, v: boolean | number) => setO((p) => ({ ...p, [k]: v }))

  return (
    <>
      <div className="grid2">
        <label className="field">
          <span className="label">
            {t('length')}: <span className="mono">{o.length}</span>
          </span>
          <input
            type="range"
            min={8}
            max={64}
            value={o.length}
            onChange={(e) => set('length', Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span className="label">{t('count')}</span>
          <CountSelect value={count} onChange={setCount} />
        </label>
      </div>
      <div className="row" style={{ gap: 18 }}>
        {CLASSES.map((k) => (
          <label className="check" key={k}>
            <input type="checkbox" checked={o[k]} onChange={(e) => set(k, e.target.checked)} />
            {t(k)}
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={o.avoidAmbiguous} onChange={(e) => set('avoidAmbiguous', e.target.checked)} />
          {t('ambiguous')}
        </label>
      </div>
      {noClass ? (
        <Notice kind="err">{t('pickOne')}</Notice>
      ) : (
        <p className="hint">
          <strong>{t(strengthKey(bits))}</strong> · {t('entropy', { bits })}
        </p>
      )}
      <div>
        <button type="button" className="btn" onClick={regenerate}>
          {t('generate')}
        </button>
      </div>
      <CopyList items={list} spaced />
    </>
  )
}

function Uuids() {
  const t = useStrings(strings)
  const [version, setVersion] = useState<'v4' | 'v7'>('v4')
  const [count, setCount] = useState(5)
  const [upper, setUpper] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const generate = useCallback(
    () =>
      Array.from({ length: count }, () => {
        let u = version === 'v4' ? uuidV4() : uuidV7()
        if (!hyphens) u = u.replace(/-/g, '')
        return upper ? u.toUpperCase() : u
      }),
    [version, count, upper, hyphens],
  )
  const [list, regenerate] = useGenerated(generate)

  return (
    <>
      <div className="row" style={{ gap: 18 }}>
        <Seg
          label={t('version')}
          value={version}
          onChange={setVersion}
          options={[
            { value: 'v4', label: t('v4') },
            { value: 'v7', label: t('v7') },
          ]}
        />
        <label className="row" style={{ gap: 8 }}>
          <span className="label">{t('count')}</span>
          <CountSelect value={count} onChange={setCount} style={{ width: 'auto' }} />
        </label>
        <label className="check">
          <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} />
          {t('uppercase')}
        </label>
        <label className="check">
          <input type="checkbox" checked={hyphens} onChange={(e) => setHyphens(e.target.checked)} />
          {t('hyphens')}
        </label>
      </div>
      <div>
        <button type="button" className="btn" onClick={regenerate}>
          {t('generate')}
        </button>
      </div>
      <CopyList items={list} />
    </>
  )
}
