import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useStrings, useT, type Strings } from '../../i18n'
import { CodeArea, CopyButton, Field } from '../../ui'
import raw from './strings.json'

const strings = raw as unknown as Strings

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  }
})

export default function MarkdownTool() {
  const t = useStrings(strings)
  const c = useT()
  const [text, setText] = useState('')
  useEffect(() => {
    setText((cur) => cur || t('sample'))
    // seed once with the sample in the current language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const html = useMemo(
    () =>
      DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: false }) as string, {
        FORBID_TAGS: ['style', 'form', 'input'],
      }),
    [text],
  )

  return (
    <div className="stack">
      <div className="grid2">
        <Field label={t('source')}>
          <CodeArea
            wrap
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('placeholder')}
            rows={18}
          />
        </Field>
        <div className="field">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">{t('preview')}</span>
            <CopyButton text={html} label={t('copyHtml')} />
          </div>
          <div
            className="md"
            style={{ border: '1px solid var(--hair)', padding: '4px 16px', minHeight: 200, overflow: 'auto' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={() => setText('')} disabled={!text}>
          {c('common.clear')}
        </button>
        <span className="hint">{t('imgNote')}</span>
      </div>
    </div>
  )
}
