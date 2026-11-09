import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError, errText, setCsrf } from '../shared/api'
import type { Dashboard } from '../shared/types'
import { Button, Spinner, ThemeToggle, Toaster, toast } from '../shared/ui'
import type { Tab } from './common'
import { Categories } from './Categories'
import { Orders } from './Orders'
import { Overview } from './Overview'
import { Products } from './Products'
import { Settings } from './Settings'
import { Sources } from './Sources'
import { Support } from './Support'
import { Services } from './Services'
import { Collections } from './Collections'
import { BotScreens } from './BotScreens'

// ── Navigation definition ─────────────────────────────────────────────────────

type NavItem = { id: Tab; label: string; icon: string; section?: string }

const NAV: NavItem[] = [
  { id: 'overview',    label: 'Обзор',           icon: '◈',  section: '' },
  { id: 'products',    label: 'Товары',           icon: '▦',  section: 'Каталог' },
  { id: 'services',    label: 'Сервисы',          icon: '✦',  section: 'Каталог' },
  { id: 'collections', label: 'Подборки',         icon: '⊞',  section: 'Каталог' },
  { id: 'categories',  label: 'Категории',        icon: '❖',  section: 'Каталог' },
  { id: 'orders',      label: 'Заказы',           icon: '▤',  section: 'Продажи' },
  { id: 'support',     label: 'Поддержка',        icon: '✉',  section: 'Продажи' },
  { id: 'sources',     label: 'Поставщики',       icon: '⇅',  section: 'Система' },
  { id: 'bot-screens', label: 'Клиентский бот',   icon: '🤖', section: 'Система' },
  { id: 'settings',    label: 'Настройки',        icon: '⚙',  section: 'Система' },
]

const VALID_TABS = new Set(NAV.map(n => n.id))
const readTab = (): Tab => {
  const t = location.hash.slice(1) as Tab
  return VALID_TABS.has(t) ? t : 'overview'
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ tab, go, badges, shopName, onLogout }:
  { tab: Tab; go: (t: Tab) => void; badges: Partial<Record<Tab, number>>; shopName: string; onLogout: () => void }) {

  const sections = [...new Set(NAV.map(n => n.section))]

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col"
      style={{ background: 'var(--c-bg2)', borderRight: '1px solid var(--c-border)' }}>

      {/* Brand */}
      <div className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            {shopName.charAt(0) || 'A'}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            {shopName || 'Управление'}
          </span>
        </div>
        <ThemeToggle />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {sections.map(section => {
          const items = NAV.filter(n => n.section === section)
          return (
            <div key={section} className="mb-4">
              {section && (
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--c-muted)' }}>
                  {section}
                </div>
              )}
              {items.map(n => {
                const active = tab === n.id
                const badge = badges[n.id]
                return (
                  <button key={n.id} onClick={() => go(n.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                    style={active
                      ? { background: 'var(--c-accent)', color: '#fff' }
                      : { color: 'var(--c-muted)' }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--c-bg3)'; if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--c-text)' }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--c-muted)' } }}>
                    <span className="w-4 shrink-0 text-center text-base leading-none">{n.icon}</span>
                    <span className="flex-1 text-left">{n.label}</span>
                    {!!badge && (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 space-y-1" style={{ borderTop: '1px solid var(--c-border)' }}>
        <a href="/" target="_blank" rel="noopener"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
          style={{ color: 'var(--c-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg3)'; e.currentTarget.style.color = 'var(--c-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--c-muted)' }}>
          <span className="w-4 text-center">↗</span>
          <span>Витрина</span>
        </a>
        <button onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
          style={{ color: 'var(--c-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg3)'; e.currentTarget.style.color = 'var(--c-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--c-muted)' }}>
          <span className="w-4 text-center">⏻</span>
          <span>Выйти</span>
        </button>
      </div>
    </aside>
  )
}

// ── Mobile top bar ────────────────────────────────────────────────────────────

function MobileBar({ tab, go, badges, shopName, onLogout }:
  { tab: Tab; go: (t: Tab) => void; badges: Partial<Record<Tab, number>>; shopName: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 header-bg lg:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
          {shopName.charAt(0) || 'A'}
        </span>
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
          {NAV.find(n => n.id === tab)?.label ?? 'Управление'}
        </span>
        <ThemeToggle />
        <button onClick={() => setOpen(o => !o)}
          className="rounded-lg p-2 text-sm transition"
          style={{ background: 'var(--c-bg3)', color: 'var(--c-text)' }}>
          ☰
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.5)' }} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col overflow-y-auto"
            style={{ background: 'var(--c-bg2)' }}
            onClick={e => e.stopPropagation()}>
            <Sidebar tab={tab} go={t => { go(t); setOpen(false) }} badges={badges}
              shopName={shopName} onLogout={onLogout} />
          </aside>
        </div>
      )}
    </>
  )
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export function PageShell({ title, subtitle, actions, children }:
  { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>{title}</h1>
          {subtitle && <p className="mt-1 text-sm" style={{ color: 'var(--c-muted)' }}>{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

export function StatTile({ label, value, hint, onClick, tone = 'default' }:
  { label: string; value: ReactNode; hint?: string; onClick?: () => void; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const toneStyles: Record<string, React.CSSProperties> = {
    default: {},
    good:    { borderColor: 'var(--c-good)', background: 'color-mix(in srgb, var(--c-good) 6%, var(--c-card-bg))' },
    bad:     { borderColor: 'var(--c-bad)', background: 'color-mix(in srgb, var(--c-bad) 6%, var(--c-card-bg))' },
    warn:    { borderColor: 'var(--c-warn)', background: 'color-mix(in srgb, var(--c-warn) 6%, var(--c-card-bg))' },
  }
  return (
    <button onClick={onClick} disabled={!onClick}
      className="card flex flex-col gap-1 p-4 text-left transition enabled:hover:shadow-md"
      style={toneStyles[tone]}>
      <div className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>{value}</div>
      {hint && <div className="text-xs" style={{ color: 'var(--c-muted)' }}>{hint}</div>}
    </button>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export function App() {
  const [auth, setAuth] = useState<'checking' | 'out' | 'in'>('checking')
  const [data, setData] = useState<Dashboard | null>(null)
  const [tab, setTab] = useState<Tab>(readTab)

  const reload = useCallback(async () => {
    try {
      setData(await api<Dashboard>('dashboard'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuth('out')
      else toast(errText(e), true)
    }
  }, [])

  useEffect(() => {
    api<{ csrf: string }>('session')
      .then(r => { setCsrf(r.csrf); setAuth('in'); reload() })
      .catch(() => setAuth('out'))
    const onHash = () => setTab(readTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [reload])

  const go = (t: Tab) => { location.hash = t; window.scrollTo(0, 0) }

  async function logout() {
    await api('logout', 'POST').catch(() => {})
    setData(null); setAuth('out')
  }

  if (auth === 'checking') return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--c-bg)' }}>
      <Spinner className="h-6 w-6 text-[var(--c-accent)]" />
    </div>
  )
  if (auth === 'out') return <><Login onIn={() => { setAuth('in'); reload() }} /><Toaster /></>

  const shopName = data?.catalog_sync ? 'ByBlock' : 'Управление'

  const badges: Partial<Record<Tab, number>> = data ? {
    orders:  data.orders.filter(o => o.state === 'attention').length,
    support: data.tickets.filter(t => t.state === 'open').length,
    sources: data.unmatched_count,
  } : {}

  const props = data && { data, reload, go }
  const pages = props && {
    overview:    <Overview {...props} />,
    products:    <Products {...props} />,
    services:    <Services {...props} />,
    collections: <Collections {...props} />,
    categories:  <Categories {...props} />,
    sources:     <Sources {...props} />,
    orders:      <Orders {...props} />,
    support:     <Support {...props} />,
    'bot-screens': <BotScreens {...props} />,
    settings:    <Settings {...props} />,
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--c-bg)' }}>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar tab={tab} go={go} badges={badges} shopName={shopName} onLogout={logout} />
      </div>

      {/* Mobile top bar */}
      <MobileBar tab={tab} go={go} badges={badges} shopName={shopName} onLogout={logout} />

      {/* Page content */}
      <main className="lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          {pages
            ? pages[tab]
            : <div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-[var(--c-accent)]" /></div>}
        </div>
      </main>

      <Toaster />
    </div>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────

function Login({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const r = await api<{ csrf: string }>('login', 'POST', { password })
      setCsrf(r.csrf); onIn()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'var(--c-bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-bold text-white">
            A
          </span>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Вход в панель управления</h1>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="pw">Пароль</label>
            <input id="pw" type="password" autoFocus autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)}
              className="input" placeholder="••••••••••••" aria-label="Пароль" />
          </div>
          {error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'color-mix(in srgb, var(--c-bad) 12%, var(--c-bg2))', color: 'var(--c-bad)' }} role="alert">{error}</p>}
          <Button variant="primary" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : 'Войти'}
          </Button>
          <p className="text-center text-xs" style={{ color: 'var(--c-muted)' }}>Пароль задан в ADMIN_PASSWORD на сервере</p>
        </form>
      </div>
    </div>
  )
}
