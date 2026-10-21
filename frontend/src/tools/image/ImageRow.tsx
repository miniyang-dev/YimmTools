import { useStrings } from '../../i18n'
import { strings } from './strings'
import type { Item } from './useImageBatch'

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`)

export function ImageRow({
  item,
  onRemove,
  onDownload,
}: {
  item: Item
  onRemove: (id: number) => void
  onDownload: (item: Item) => void
}) {
  const t = useStrings(strings)
  const delta = item.blob ? Math.round((1 - item.blob.size / item.file.size) * 100) : 0
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {item.url ? (
            <img
              src={item.url}
              alt=""
              style={{ width: 44, height: 44, objectFit: 'cover', border: '1px solid var(--hair)' }}
            />
          ) : null}
          <span style={{ overflowWrap: 'anywhere' }}>{item.file.name}</span>
        </div>
      </td>
      <td className="mono">{kb(item.file.size)}</td>
      <td className="mono">
        {item.state === 'working' ? (
          t('working')
        ) : item.state === 'error' ? (
          '—'
        ) : (
          <>
            {kb(item.blob!.size)}
            <div className="hint">{t('dimension', { w: item.w!, h: item.h! })}</div>
          </>
        )}
      </td>
      <td
        className="mono"
        style={{ color: item.state === 'done' ? (delta >= 0 ? 'var(--ok)' : 'var(--red)') : undefined }}
      >
        {item.state === 'done'
          ? delta >= 0
            ? `−${delta}%`
            : `+${-delta}% ${t('bigger')}`
          : item.state === 'error'
            ? t('failed')
            : ''}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button type="button" className="btn sm" disabled={item.state !== 'done'} onClick={() => onDownload(item)}>
          {t('download')}
        </button>{' '}
        <button type="button" className="btn ghost sm" onClick={() => onRemove(item.id)}>
          {t('remove')}
        </button>
      </td>
    </tr>
  )
}
