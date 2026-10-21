import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LANGS, useLang, useT, type Lang } from '../i18n'
import { useTheme } from './theme'

export function Masthead({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { theme, cycle } = useTheme()

  const switchLang = (next: Lang) => {
    const rest = pathname.split('/').slice(2).join('/')
    navigate(`/${next}/${rest}${search}`)
  }

  return (
    <header className="mast">
      <Link className="brand" to={`/${lang}/`} aria-label={`YimmTool — ${t('nav.home')}`}>
        <span className="wordmark">
          Yimm<i>·</i>Tool
        </span>
        <span className="tagline">{t('app.tagline')}</span>
      </Link>
      <div className="mast-tools">
        <button
          type="button"
          className="btn ghost sm menu-btn"
          aria-expanded={menuOpen}
          aria-controls="index"
          onClick={onMenu}
        >
          {t('nav.menu')}
        </button>
        <select
          aria-label={t('lang.label')}
          value={lang}
          onChange={(e) => switchLang(e.target.value as Lang)}
          style={{ width: 'auto', minHeight: 32, padding: '4px 28px 4px 8px' }}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn ghost sm"
          onClick={cycle}
          aria-label={`${t('theme.label')}: ${t(`theme.${theme}`)}`}
        >
          {t(`theme.${theme}`)}
        </button>
      </div>
    </header>
  )
}
