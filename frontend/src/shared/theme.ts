/**
 * Lightweight theme system. Theme is stored on <html data-theme="dark|light">.
 * localStorage key "theme" persists the choice across sessions.
 * Dark is the default when no preference is stored.
 */
const LS_KEY = 'theme'

export type Theme = 'dark' | 'light'

export function initTheme(): Theme {
  const stored = localStorage.getItem(LS_KEY)
  const theme: Theme = stored === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme
  return theme
}

export function getTheme(): Theme {
  return (document.documentElement.dataset.theme as Theme) ?? 'dark'
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  localStorage.setItem(LS_KEY, t)
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
