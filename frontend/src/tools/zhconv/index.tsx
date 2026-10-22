import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { diffChars } from 'diff'
import { useLang, useStrings, useT, type Strings } from '../../i18n'
import { CopyButton, Field, Notice, Seg } from '../../ui'
import raw from './strings.json'

const strings = raw as unknown as Strings

type Target = 'tw' | 'hk' | 'cn'
type Convert = (text: string) => string

/** OpenCC locale pairs. "twp" also swaps wording (软件 → 軟體), plain "tw" only swaps characters. */
function spec(target: Target, phrases: boolean): { pack: 'cn2t' | 't2cn'; from: string; to: string } {
  if (target === 'cn') return { pack: 't2cn', from: phrases ? 'twp' : 'tw', to: 'cn' }
  if (target === 'hk') return { pack: 'cn2t', from: 'cn', to: 'hk' }
  return { pack: 'cn2t', from: 'cn', to: phrases ? 'twp' : 'tw' }
}

// The dictionaries are large (Simplified → Traditional ≈ 450 kB gzipped), so each direction is its own
// chunk, loaded only when this tool opens, and kept once built.
const PACKS = { cn2t: () => import('opencc-js/cn2t'), t2cn: () => import('opencc-js/t2cn') }
const built = new Map<string, Promise<Convert>>()

function loadConverter(target: Target, phrases: boolean): Promise<Convert> {
  const { pack, from, to } = spec(target, phrases)
  const key = `${from}>${to}`
  let p = built.get(key)
  if (!p) {
    p = PACKS[pack]().then((m) => m.Converter({ from, to }))
    p.catch(() => built.delete(key)) // a failed download may be retried later
    built.set(key, p)
  }
  return p
}

function useConverter(target: Target, phrases: boolean) {
  const [state, setState] = useState<{ key: string; convert?: Convert; failed?: boolean }>({ key: '' })
  const key = `${target}:${phrases}`
  useEffect(() => {
    let live = true
    loadConverter(target, phrases).then(
      (convert) => live && setState({ key, convert }),
      () => live && setState({ key, failed: true }),
    )
    return () => {
      live = false
    }
  }, [target, phrases, key])
  return state.key === key ? state : { key, convert: undefined, failed: false }
}

/** The output with every character that is new relative to the input marked (wording can change length: 内存 → 記憶體). */
function marked(src: string, out: string): { nodes: ReactNode[]; changed: number } {
  const nodes: ReactNode[] = []
  let changed = 0
  diffChars(src, out).forEach((part, i) => {
    if (part.removed) return
    if (!part.added) nodes.push(part.value)
    else {
      changed += Array.from(part.value).length
      nodes.push(
        <mark key={i} className="hit">
          {part.value}
        </mark>,
      )
    }
  })
  return { nodes, changed }
}

const EXAMPLE: Record<Target, string> = { tw: '软件 → 軟體', hk: '软件 → 軟件', cn: '軟體 → 软件' }

export default function ZhConvTool() {
  const t = useStrings(strings)
  const c = useT()
  const lang = useLang()
  const [target, setTarget] = useState<Target>(lang === 'zh-CN' ? 'cn' : 'tw')
  const [phrases, setPhrases] = useState(true)
  const [text, setText] = useState('')
  const source = useDeferredValue(text)
  const { convert, failed } = useConverter(target, phrases)

  const out = useMemo(() => (convert && source ? convert(source) : ''), [convert, source])
  const marks = useMemo(() => (out ? marked(source, out) : null), [source, out])

  return (
    <div className="stack">
      <div className="row" style={{ '--seg-min': '6em' } as CSSProperties}>
        <Seg
          fill
          label={t('target')}
          value={target}
          onChange={setTarget}
          options={[
            { value: 'tw', label: t('toTw') },
            { value: 'hk', label: t('toHk') },
            { value: 'cn', label: t('toCn') },
          ]}
        />
        {target !== 'hk' ? (
          <label className="check">
            <input type="checkbox" checked={phrases} onChange={(e) => setPhrases(e.target.checked)} />
            {t('phrases')}
            <span className="hint" lang="zh">
              {EXAMPLE[target]}
            </span>
          </label>
        ) : null}
      </div>

      <Field label={t('input')}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          rows={8}
          lang="zh"
        />
      </Field>

      {failed ? <Notice kind="err">{t('loadFailed')}</Notice> : null}

      <div className="field">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label">
            {c('common.output')}
            {marks && source ? (
              <span className="hint">
                {' · '}
                {marks.changed ? t('changed', { n: marks.changed }) : t('unchanged')}
              </span>
            ) : null}
          </span>
          <div className="row">
            <button type="button" className="btn ghost sm" disabled={!out} onClick={() => setText(out)}>
              ↑ {c('common.input')}
            </button>
            <CopyButton text={out} />
          </div>
        </div>
        {!convert && !failed ? (
          <pre className="out empty" role="status">
            {t('loading')}
          </pre>
        ) : out ? (
          <pre className="out" lang={target === 'cn' ? 'zh-CN' : target === 'hk' ? 'zh-HK' : 'zh-TW'}>
            {marks?.nodes}
          </pre>
        ) : (
          <pre className="out empty">{t('emptyOut')}</pre>
        )}
      </div>
    </div>
  )
}
