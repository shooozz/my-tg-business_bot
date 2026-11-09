/**
 * Theme system with three modes: dark | light | system.
 *
 * The actual applied theme (data-theme on <html>) is always 'dark' or 'light'.
 * Mode 'system' means: follow prefers-color-scheme and update when it changes.
 *
 * localStorage key 'theme' stores the user's chosen mode.
 * Default when nothing is stored: 'dark'.
 */

export type ThemeMode = 'dark' | 'light' | 'system'
export type Theme = 'dark' | 'light'

const LS_KEY = 'theme'

function getSystemPreference(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyMode(mode: ThemeMode): Theme {
  const t: Theme = mode === 'system' ? getSystemPreference() : mode
  document.documentElement.dataset.theme = t
  return t
}

let _systemListener: (() => void) | null = null

function attachSystemListener(mode: ThemeMode) {
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  if (_systemListener) { mq.removeEventListener('change', _systemListener); _systemListener = null }
  if (mode === 'system') {
    _systemListener = () => applyMode('system')
    mq.addEventListener('change', _systemListener)
  }
}

/**
 * Call once at app startup (called from main.tsx).
 * Sets up cross-tab sync and system-preference listener.
 */
export function initTheme(): Theme {
  const storedMode = (localStorage.getItem(LS_KEY) as ThemeMode | null) ?? 'dark'
  const applied = applyMode(storedMode)
  attachSystemListener(storedMode)

  // Cross-tab sync: when another tab changes the theme, apply it here too.
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY && e.newValue) {
      const newMode = e.newValue as ThemeMode
      applyMode(newMode)
      attachSystemListener(newMode)
    }
  })

  return applied
}

/** Returns the stored mode ('dark' | 'light' | 'system'). */
export function getMode(): ThemeMode {
  return (localStorage.getItem(LS_KEY) as ThemeMode) ?? 'dark'
}

/** Returns the currently applied theme ('dark' or 'light'). */
export function getTheme(): Theme {
  return (document.documentElement.dataset.theme as Theme) ?? 'dark'
}

/** Set the theme mode and apply it. */
export function setMode(mode: ThemeMode): Theme {
  try { localStorage.setItem(LS_KEY, mode) } catch (_) {}
  attachSystemListener(mode)
  return applyMode(mode)
}

/** Cycle through modes: dark → light → system → dark. */
export function cycleTheme(): ThemeMode {
  const cur = getMode()
  const next: ThemeMode = cur === 'dark' ? 'light' : cur === 'light' ? 'system' : 'dark'
  setMode(next)
  return next
}

// Back-compat shims
export function setTheme(t: Theme) { setMode(t) }
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  setMode(next)
  return next
}
