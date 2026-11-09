import type { Dashboard } from '../shared/types'

export type Tab =
  | 'overview'
  | 'products'
  | 'services'
  | 'collections'
  | 'categories'
  | 'sources'
  | 'orders'
  | 'support'
  | 'bot-screens'
  | 'settings'

export interface PageProps {
  data: Dashboard
  reload: () => Promise<void>
  go: (tab: Tab) => void
}

/** Category markup overrides the global one (null = use global). */
export function markupFor(d: Dashboard, categoryId: number | null) {
  return d.categories.find(c => c.id === categoryId)?.markup_percent ?? d.markup_percent
}

export const isFrozen = (d: Dashboard, categoryId: number | null) =>
  d.categories.find(c => c.id === categoryId)?.auto_update === 0

export const stockText = (n: number) => (n >= 100 ? 'много' : String(n))

// ── Themed CSS shorthand helpers ─────────────────────────────────────────────

export const themed = {
  text:   { color: 'var(--c-text)' },
  muted:  { color: 'var(--c-muted)' },
  accent: { color: 'var(--c-accent)' },
  good:   { color: 'var(--c-good)' },
  bad:    { color: 'var(--c-bad)' },
  warn:   { color: 'var(--c-warn)' },
  bg:     { background: 'var(--c-bg)' },
  bg2:    { background: 'var(--c-bg2)' },
  bg3:    { background: 'var(--c-bg3)' },
  border: { borderColor: 'var(--c-border)' },
} as const
