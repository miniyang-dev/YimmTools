import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { Strings } from '../i18n'

/**
 * Tools register themselves: a tool is a folder `src/tools/<id>/` containing
 *   - `meta.json`   id, group, order, server flag and its name/description in every language
 *   - `index.tsx`   the tool's UI (default export)
 *   - `strings.json` the UI strings used inside the tool
 * Nothing else needs editing to add one.
 */
export type GroupId = 'image' | 'data' | 'security' | 'text' | 'net'
export const GROUPS: GroupId[] = ['image', 'data', 'security', 'text', 'net']

export interface ToolMeta {
  id: string
  group: GroupId
  /** position in the contents (1-based, unique) */
  order: number
  /** needs the FastAPI backend (data leaves the browser) */
  server: boolean
  /** short, language-neutral label shown in a box next to the name, e.g. "2FA" */
  badge?: string
  /** `{ lang: { name, desc } }` */
  strings: Strings
}

export interface ToolDef extends ToolMeta {
  Component: LazyExoticComponent<ComponentType>
}

const metas = import.meta.glob<ToolMeta>('./*/meta.json', { eager: true, import: 'default' })
const loaders = import.meta.glob<{ default: ComponentType }>('./*/index.tsx')

export function buildTools(
  metaFiles: Record<string, ToolMeta>,
  loaderFiles: Record<string, () => Promise<{ default: ComponentType }>>,
): ToolDef[] {
  const tools = Object.entries(metaFiles).map(([path, meta]) => {
    const dir = path.split('/')[1]
    if (meta.id !== dir) throw new Error(`tools/${dir}/meta.json: id "${meta.id}" must match the folder name`)
    const load = loaderFiles[`./${dir}/index.tsx`]
    if (!load) throw new Error(`tools/${dir}: meta.json without an index.tsx`)
    return { ...meta, Component: lazy(load) }
  })
  const orders = tools.map((t) => t.order)
  if (new Set(orders).size !== orders.length) throw new Error('tools: duplicate "order" in meta.json files')
  return tools.sort((a, b) => a.order - b.order)
}

export const TOOLS: ToolDef[] = buildTools(metas, loaders)

export const toolNo = (id: string): string => String(TOOLS.findIndex((t) => t.id === id) + 1).padStart(2, '0')
export const findTool = (id: string | undefined) => TOOLS.find((t) => t.id === id)
