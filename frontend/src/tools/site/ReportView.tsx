import { useStrings } from '../../i18n'
import { Kv, Notice } from '../../ui'
import { strings } from './strings'
import type { Report } from './types'

const NOTE_KEYS: [match: (note: string) => boolean, key: string][] = [
  [(n) => n === 'timeout', 'noteTimeout'],
  [(n) => n === 'too_many_redirects', 'noteTooMany'],
  [(n) => n.startsWith('connection_error'), 'noteConn'],
]

const section = { gap: 10 } as const

export function ReportView({ report }: { report: Report }) {
  const t = useStrings(strings)
  return (
    <div className="stack" style={{ gap: 26 }}>
      <Detections report={report} />
      <Addresses report={report} />
      <DnsSection report={report} />
      <HttpSection report={report} />
      {report.tls ? <TlsSection tls={report.tls} /> : null}
      <p className="hint">
        {t('elapsed', { ms: report.elapsed_ms })}
        {report.cached_age_s !== undefined ? ` · ${t('cachedNote', { n: report.cached_age_s })}` : ''}
      </p>
    </div>
  )
}

function Detections({ report }: { report: Report }) {
  const t = useStrings(strings)
  const kindLabel = (kind: string) => (t(`kind_${kind}`) === `kind_${kind}` ? kind : t(`kind_${kind}`))
  return (
    <section className="stack" style={section}>
      <h2 className="section-title">{t('detections')}</h2>
      {report.detections.length === 0 ? (
        <p className="hint">{t('none')}</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{t('colName')}</th>
              <th scope="col">{t('colKind')}</th>
              <th scope="col">{t('colConf')}</th>
              <th scope="col">{t('colEvidence')}</th>
            </tr>
          </thead>
          <tbody>
            {report.detections.map((d, i) => (
              <tr key={i}>
                <th scope="row" style={{ fontWeight: 600 }}>
                  {d.name}
                </th>
                <td>{kindLabel(d.kind)}</td>
                <td>
                  <span className={`tag${d.confidence === 'high' ? ' hi' : ''}`}>{t(`conf_${d.confidence}`)}</span>
                </td>
                <td className="hint">{d.evidence.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">{t('caveat')}</p>
      {report.notes.map((note) => {
        const key = NOTE_KEYS.find(([matches]) => matches(note))?.[1]
        return key ? (
          <Notice key={note} kind="warn">
            {t(key)}
          </Notice>
        ) : null
      })}
    </section>
  )
}

function Addresses({ report }: { report: Report }) {
  const t = useStrings(strings)
  return (
    <section className="stack" style={section}>
      <h2 className="section-title">{t('addresses')}</h2>
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">{t('colIp')}</th>
            <th scope="col">{t('colAsn')}</th>
            <th scope="col">{t('colPtr')}</th>
          </tr>
        </thead>
        <tbody>
          {report.ips.map((ip) => (
            <tr key={ip.ip}>
              <td>
                <code>{ip.ip}</code>
              </td>
              <td>{ip.asn ? `AS${ip.asn} · ${ip.as_name}${ip.country ? ` (${ip.country})` : ''}` : '—'}</td>
              <td>
                <code>{ip.ptr ?? '—'}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function DnsSection({ report }: { report: Report }) {
  const t = useStrings(strings)
  const { cname_chain, ns } = report.dns
  return (
    <section className="stack" style={section}>
      <h2 className="section-title">{t('dns')}</h2>
      <Kv
        rows={[
          [t('cname'), cname_chain.length ? cname_chain.join(' → ') : '—', true],
          [t('ns'), ns.length ? ns.join(', ') : '—', true],
        ]}
      />
    </section>
  )
}

function HttpSection({ report }: { report: Report }) {
  const t = useStrings(strings)
  const { http } = report
  const headers = Object.entries(http.headers)
  return (
    <section className="stack" style={section}>
      <h2 className="section-title">{t('http')}</h2>
      <Kv
        rows={[
          [t('hops'), http.hops.map((h) => `${h.status} ${h.url}`).join('\n') || '—', true],
          [t('software'), http.server_software.join('\n') || '—', true],
          [t('cookies'), http.cookie_names.join(', ') || '—', true],
        ]}
      />
      <h3 style={{ fontSize: '1rem', marginTop: 8 }}>{t('security')}</h3>
      <div className="row" style={{ gap: 8 }}>
        {Object.entries(http.security_headers).map(([name, on]) => (
          <span key={name} className={`tag${on ? ' hi' : ''}`}>
            {name}: {on ? t('present') : t('missing')}
          </span>
        ))}
      </div>
      <details>
        <summary style={{ cursor: 'pointer', font: '500 0.875rem var(--sans)' }}>
          {t('allHeaders')} ({headers.length})
        </summary>
        <dl className="kv" style={{ marginTop: 8 }}>
          {headers.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt className="mono">{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  )
}

function TlsSection({ tls }: { tls: NonNullable<Report['tls']> }) {
  const t = useStrings(strings)
  const expires = `${tls.not_after ?? '—'}${tls.days_left !== undefined ? ` · ${t('daysLeft', { n: tls.days_left })}` : ''}`
  return (
    <section className="stack" style={section}>
      <h2 className="section-title">{t('tls')}</h2>
      {tls.verified === false ? <Notice kind="err">{t('verifyFail', { msg: tls.error ?? '' })}</Notice> : null}
      {tls.verified === null ? <Notice kind="warn">{t('tlsErr', { msg: tls.error ?? '' })}</Notice> : null}
      {tls.verified ? (
        <Kv
          rows={[
            [t('subject'), tls.subject ?? '—'],
            [t('issuer'), tls.issuer ?? '—'],
            [t('expires'), expires],
            [t('protocol'), `${tls.protocol ?? ''} ${tls.cipher ?? ''}`.trim() || '—', true],
          ]}
        />
      ) : null}
    </section>
  )
}
