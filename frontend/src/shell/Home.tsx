import { Link } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { GROUPS, TOOLS, toolNo } from '../tools/registry'
import { useToolText } from './useToolText'

/** Contents page: every tool, grouped, with a local/server tag. */
export function Home() {
  const t = useT()
  const lang = useLang()
  const text = useToolText()
  return (
    <div className="home tool">
      <h1>{t('home.title')}</h1>
      <p className="lede">{t('home.lede')}</p>
      <div className="contents">
        {GROUPS.map((group) => (
          <section key={group}>
            <h2>{t(`group.${group}`)}</h2>
            {TOOLS.filter((x) => x.group === group).map((tool) => (
              <Link key={tool.id} to={`/${lang}/${tool.id}`}>
                <span className="no">{toolNo(tool.id)}</span>
                <span className="nm">{text(tool, 'name')}</span>
                <span className={`tag${tool.server ? ' hi' : ''}`}>
                  {tool.server ? t('badge.server') : t('badge.local')}
                </span>
                <span className="ds">{text(tool, 'desc')}</span>
              </Link>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
