import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LANGS, useLang, useT, type Lang } from '../i18n'
import { useTheme } from './theme'

export function Masthead({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { theme, cycle } = useTheme()
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0]

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
        {/* the native select stays (keyboard, phone pickers) but is laid transparently over a label we can style */}
        <span className="lang-pick">
          <span aria-hidden="true">
            <span className="long">{current.label}</span>
            <span className="short">{current.short}</span>
          </span>
          <select aria-label={t('lang.label')} value={lang} onChange={(e) => switchLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </span>
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
