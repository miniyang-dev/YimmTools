import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { GROUPS, TOOLS, toolNo } from '../tools/registry'
import { useToolText } from './useToolText'

/** Left-hand contents column: search (⌘K / Ctrl+K), then tools grouped by category. */
export function Index({ open }: { open: boolean }) {
  const t = useT()
  const text = useToolText()
  const lang = useLang()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const needle = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      TOOLS.filter(
        (tool) =>
          !needle ||
          `${text(tool, 'name')} ${text(tool, 'desc')} ${tool.id} ${tool.badge ?? ''}`.toLowerCase().includes(needle),
      ),
    [needle, text],
  )

  return (
    <nav className={`index${open ? ' open' : ''}`} id="index" aria-label={t('nav.menu')}>
      <div className="index-search">
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={t('nav.searchPlaceholder')}
          aria-label={t('nav.search')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && visible[0]) navigate(`/${lang}/${visible[0].id}`)
            if (e.key === 'Escape') setQuery('')
          }}
        />
      </div>
      {visible.length === 0 ? <p className="none">{t('nav.none')}</p> : null}
      {GROUPS.map((group) => {
        const items = visible.filter((x) => x.group === group)
        if (!items.length) return null
        return (
          <div className="index-group" key={group}>
            <h2>{t(`group.${group}`)}</h2>
            {items.map((tool) => (
              <NavLink key={tool.id} to={`/${lang}/${tool.id}`}>
                <span className="no">{toolNo(tool.id)}</span>
                <span>
                  {text(tool, 'name')}
                  {tool.badge ? <span className="index-badge">{tool.badge}</span> : null}
                </span>
              </NavLink>
            ))}
          </div>
        )
      })}
    </nav>
  )
}
