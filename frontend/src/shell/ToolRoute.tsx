import { Link, useParams } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { findTool } from '../tools/registry'
import { useToolText } from './useToolText'

/** Renders one tool page (heading, lede, local/server badge, then the tool itself) or a not-found page. */
export function ToolRoute() {
  const { toolId } = useParams()
  const t = useT()
  const lang = useLang()
  const text = useToolText()
  const tool = findTool(toolId)

  if (!tool) {
    return (
      <div className="tool">
        <header className="tool-head">
          <h1>{t('notfound.title')}</h1>
          <p className="lede">{t('notfound.body')}</p>
        </header>
        <Link className="btn ghost" to={`/${lang}/`}>
          {t('nav.home')}
        </Link>
      </div>
    )
  }

  const { Component } = tool
  return (
    <article className="tool" key={tool.id}>
      <header className="tool-head">
        <h1>{text(tool, 'name')}</h1>
        <p className="lede">{text(tool, 'desc')}</p>
        <div className="badges">
          <span className={`badge${tool.server ? ' server' : ''}`}>
            {tool.server ? t('badge.server') : t('badge.local')}
          </span>
        </div>
      </header>
      <Component />
    </article>
  )
}
