import { useState, type FormEvent } from 'react'
import { useStrings } from '../../i18n'
import { Field, Notice } from '../../ui'
import { ReportView } from './ReportView'
import { strings } from './strings'
import { useInspection } from './useInspection'

export default function SiteTool() {
  const t = useStrings(strings)
  const [url, setUrl] = useState('')
  const { inspect, busy, queued, error, report } = useInspection()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim() && !busy) void inspect(url.trim())
  }

  return (
    <div className="stack">
      <Notice>{t('serverNote')}</Notice>
      <form onSubmit={submit} className="stack">
        <Field label={t('url')}>
          <input
            type="text"
            className="mono"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('placeholder')}
            spellCheck={false}
            inputMode="url"
          />
        </Field>
        <div>
          <button type="submit" className="btn" disabled={busy || !url.trim()}>
            {busy ? (queued ? t('queued') : t('running')) : t('run')}
          </button>
        </div>
      </form>
      {queued ? <Notice>{t('queuedNote')}</Notice> : null}
      {error ? <Notice kind="err">{error}</Notice> : null}
      {report ? <ReportView report={report} /> : null}
    </div>
  )
}
