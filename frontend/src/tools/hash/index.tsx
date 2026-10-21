import { useEffect, useMemo, useState } from 'react'
import { useStrings, useT, type Strings } from '../../i18n'
import { CopyButton, Field, FileButton, Notice, Seg, useDebounced } from '../../ui'
import { HASH_ALGOS, digest, hmac, toBase64, toHex, utf8, type HashAlgo } from '../../lib/hash'
import raw from './strings.json'

const strings = raw as unknown as Strings

type Digests = Record<HashAlgo, Uint8Array>

export default function HashTool() {
  const t = useStrings(strings)
  const c = useT()
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [key, setKey] = useState('')
  const [fmt, setFmt] = useState<'hex' | 'base64'>('hex')
  const [upper, setUpper] = useState(false)
  const [digests, setDigests] = useState<Digests | null>(null)

  // Hashing is the expensive part (large files, 5 algorithms): debounce typing and
  // recompute only when the data or key change — never for a display-format toggle.
  const dText = useDebounced(text, 200)
  const dKey = useDebounced(key, 200)

  useEffect(() => {
    let alive = true
    if (!file && !dText) {
      setDigests(null)
      return
    }
    const data = file ? file.bytes : utf8(dText)
    const keyBytes = utf8(dKey)
    Promise.all(
      HASH_ALGOS.map(async (a) => [a, dKey ? await hmac(a, keyBytes, data) : await digest(a, data)] as const),
    ).then(
      (pairs) => alive && setDigests(Object.fromEntries(pairs) as Digests),
      () => alive && setDigests(null),
    )
    return () => {
      alive = false
    }
  }, [dText, dKey, file])

  const rows = useMemo(() => {
    if (!digests) return null
    return Object.fromEntries(
      HASH_ALGOS.map((a) => {
        const s = fmt === 'hex' ? toHex(digests[a]) : toBase64(digests[a])
        return [a, upper && fmt === 'hex' ? s.toUpperCase() : s]
      }),
    ) as Record<HashAlgo, string>
  }, [digests, fmt, upper])

  const onFile = async (f: File) => setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })

  return (
    <div className="stack">
      <Field label={t('text')}>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFile(null)
          }}
          placeholder={t('placeholder')}
          rows={5}
          spellCheck={false}
          disabled={!!file}
        />
      </Field>
      <div className="row">
        <FileButton onFile={(f) => void onFile(f)}>{t('file')}</FileButton>
        {file ? (
          <>
            <span className="hint">{t('fileName', { name: file.name, size: file.bytes.length })}</span>
            <button type="button" className="btn ghost sm" onClick={() => setFile(null)}>
              {c('common.clear')}
            </button>
          </>
        ) : null}
      </div>

      <Field label={t('hmacKey')}>
        <input
          type="text"
          className="mono"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <div className="row" style={{ gap: 18 }}>
        <Seg
          label={t('output')}
          value={fmt}
          onChange={setFmt}
          options={[
            { value: 'hex', label: t('hex') },
            { value: 'base64', label: t('base64') },
          ]}
        />
        {fmt === 'hex' ? (
          <label className="check">
            <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} />
            {t('upper')}
          </label>
        ) : null}
      </div>

      {rows ? (
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{dKey ? `${t('hmacOn')}-${t('algo')}` : t('algo')}</th>
              <th scope="col">{t('value')}</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {HASH_ALGOS.map((a) => (
              <tr key={a}>
                <th scope="row" style={{ fontWeight: 500, whiteSpace: 'nowrap', paddingRight: 14 }}>
                  {a}
                </th>
                <td>
                  <code style={{ overflowWrap: 'anywhere' }}>{rows[a]}</code>
                </td>
                <td>
                  <CopyButton text={rows[a]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <Notice kind="warn">{t('md5Warn')}</Notice>
    </div>
  )
}
