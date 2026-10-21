import { useMemo, useState } from 'react'
import { useStrings, useT, type Strings } from '../../i18n'
import { Field, Notice, OutputField, Seg } from '../../ui'
import { b64Decode, b64Encode } from '../../lib/text'
import raw from './strings.json'

const strings = raw as unknown as Strings

export default function EncodeTool() {
  const t = useStrings(strings)
  const c = useT()
  const [kind, setKind] = useState<'base64' | 'url'>('base64')
  const [dir, setDir] = useState<'encode' | 'decode'>('encode')
  const [urlSafe, setUrlSafe] = useState(false)
  const [whole, setWhole] = useState(false)
  const [text, setText] = useState('')

  const result = useMemo(() => {
    if (!text) return { out: '', err: '' }
    try {
      if (kind === 'base64') return { out: dir === 'encode' ? b64Encode(text, urlSafe) : b64Decode(text), err: '' }
      if (dir === 'encode') return { out: whole ? encodeURI(text) : encodeURIComponent(text), err: '' }
      return { out: whole ? decodeURI(text) : decodeURIComponent(text), err: '' }
    } catch {
      return { out: '', err: kind === 'base64' ? t('errB64') : t('errUrl') }
    }
  }, [text, kind, dir, urlSafe, whole, t])

  return (
    <div className="stack">
      <div className="row">
        <Seg
          label={t('kind')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'base64', label: 'Base64' },
            { value: 'url', label: 'URL' },
          ]}
        />
        <Seg
          label={t('direction')}
          value={dir}
          onChange={setDir}
          options={[
            { value: 'encode', label: t('encode') },
            { value: 'decode', label: t('decode') },
          ]}
        />
        {kind === 'base64' && dir === 'encode' ? (
          <label className="check">
            <input type="checkbox" checked={urlSafe} onChange={(e) => setUrlSafe(e.target.checked)} />
            {t('urlSafe')}
          </label>
        ) : null}
        {kind === 'url' ? (
          <label className="check">
            <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} />
            {t('whole')}
          </label>
        ) : null}
      </div>

      <Field label={t('input')}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          spellCheck={false}
          rows={7}
        />
      </Field>

      {result.err ? <Notice kind="err">{result.err}</Notice> : null}

      <OutputField
        label={c('common.output')}
        value={result.out}
        placeholder={t('emptyOut')}
        actions={
          <button type="button" className="btn ghost sm" disabled={!result.out} onClick={() => setText(result.out)}>
            ↑ {c('common.input')}
          </button>
        }
      />
    </div>
  )
}
