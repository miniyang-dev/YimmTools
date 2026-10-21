import { useMemo, useState } from 'react'
import { useStrings } from '../../i18n'
import { DropZone, Notice, Seg, downloadBlob, useDebounced } from '../../ui'
import { ImageRow } from './ImageRow'
import { strings } from './strings'
import { outputName, type Fmt, type Options } from './transcode'
import { useImageBatch, type Item } from './useImageBatch'

const DEBOUNCE_MS = 300
const DOWNLOAD_STAGGER_MS = 250 // browsers drop simultaneous downloads

export default function ImageTool() {
  const t = useStrings(strings)
  const [fmt, setFmt] = useState<Fmt>('webp')
  const [quality, setQuality] = useState(0.8)
  const [maxWidth, setMaxWidth] = useState(0)

  // Re-encoding is expensive: wait for the slider / field to settle.
  const settledQuality = useDebounced(quality, DEBOUNCE_MS)
  const settledWidth = useDebounced(maxWidth, DEBOUNCE_MS)
  const options = useMemo<Options>(
    () => ({ fmt, quality: settledQuality, maxWidth: settledWidth }),
    [fmt, settledQuality, settledWidth],
  )
  const { items, add, remove } = useImageBatch(options)

  const download = (item: Item) => item.blob && downloadBlob(item.blob, outputName(item.file.name, item.blob.type))
  const done = items.filter((i) => i.state === 'done' && i.blob)

  return (
    <div className="stack">
      <DropZone accept="image/*" multiple onFiles={add}>
        {t('drop')}
      </DropZone>

      <div className="grid2">
        <div className="field">
          <span className="label">{t('format')}</span>
          <Seg
            label={t('format')}
            value={fmt}
            onChange={setFmt}
            options={[
              { value: 'webp', label: 'WebP' },
              { value: 'jpeg', label: 'JPEG' },
              { value: 'png', label: 'PNG' },
              { value: 'keep', label: t('keep') },
            ]}
          />
        </div>
        <label className="field">
          <span className="label">
            {t('quality')}: <span className="mono">{Math.round(quality * 100)}</span>
          </span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span className="label">{t('maxWidth')}</span>
          <input
            type="number"
            min={0}
            max={20000}
            step={50}
            value={maxWidth}
            onChange={(e) => setMaxWidth(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
      </div>

      {fmt === 'png' ? <Notice kind="warn">{t('pngNote')}</Notice> : null}
      {fmt === 'jpeg' ? <Notice>{t('jpegNote')}</Notice> : null}

      {items.length ? (
        <>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{t('colName')}</th>
                <th scope="col">{t('colBefore')}</th>
                <th scope="col">{t('colAfter')}</th>
                <th scope="col">{t('colSaved')}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <ImageRow key={i.id} item={i} onRemove={remove} onDownload={download} />
              ))}
            </tbody>
          </table>
          {done.length > 1 ? (
            <div>
              <button
                type="button"
                className="btn"
                onClick={() => done.forEach((i, n) => window.setTimeout(() => download(i), n * DOWNLOAD_STAGGER_MS))}
              >
                {t('downloadAll')}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      <p className="hint">{t('privacy')}</p>
    </div>
  )
}
