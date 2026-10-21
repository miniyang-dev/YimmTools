import { Suspense, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { LangProvider, detectLang, isLang, rememberLang, useLang, useT, type Lang } from '../i18n'
import { findTool } from '../tools/registry'
import { Index } from './Index'
import { useToolText } from './useToolText'
import { Masthead } from './Masthead'

/** Route element for `/:lang/*`: validates the language, provides it, and renders the page frame. */
export function LangLayout() {
  const { lang, toolId } = useParams()
  const loc = useLocation()
  if (!isLang(lang)) {
    const detected = detectLang()
    // "/totp" without a language prefix
    if (findTool(lang)) return <Navigate to={`/${detected}/${lang}${loc.search}`} replace />
    return <Navigate to={`/${detected}/`} replace />
  }
  return (
    <LangProvider value={lang}>
      <DocumentEffects lang={lang} toolId={toolId} />
      <Frame />
    </LangProvider>
  )
}

/** Keeps <html lang>, the saved language, CJK font loading, title and meta description in sync with the route. */
function DocumentEffects({ lang, toolId }: { lang: Lang; toolId?: string }) {
  const t = useT()
  const text = useToolText()
  const tool = findTool(toolId)

  useEffect(() => {
    document.documentElement.lang = lang
    rememberLang(lang)
    // CJK serif faces are large; fetch only the one this language needs
    if (lang === 'zh-TW') void import('@fontsource-variable/noto-serif-tc')
    else if (lang === 'zh-CN') void import('@fontsource-variable/noto-serif-sc')
    else if (lang === 'ja') void import('@fontsource-variable/noto-serif-jp')
  }, [lang])

  useEffect(() => {
    document.title = tool ? `${text(tool, 'name')} — YimmTool` : 'YimmTool'
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', tool ? text(tool, 'desc') : t('home.lede'))
  }, [tool, t, text, lang])

  return null
}

function Frame() {
  const t = useT()
  const lang = useLang()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <>
      <a className="skip-link" href="#main">
        {t('nav.skip')}
      </a>
      <Masthead onMenu={() => setMenuOpen((v) => !v)} menuOpen={menuOpen} />
      <div className="shell">
        <Index open={menuOpen} />
        <main className="main" id="main" tabIndex={-1}>
          <Suspense
            fallback={
              <p className="hint" role="status">
                …
              </p>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      <footer className="foot">
        <span>{t('footer.note')}</span>
        <span lang={lang}>YimmTool</span>
      </footer>
    </>
  )
}
