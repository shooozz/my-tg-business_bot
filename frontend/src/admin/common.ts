import type { Dashboard } from '../shared/types'

export type Tab = 'overview' | 'products' | 'categories' | 'sources' | 'orders' | 'support' | 'settings'

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
