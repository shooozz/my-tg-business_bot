import { useCallback, useEffect, useState, type FormEvent } from 'react'
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

const TABS: [Tab, string, string][] = [
  ['overview', 'Обзор', '◈'], ['products', 'Товары', '▦'], ['categories', 'Категории', '❖'],
  ['sources', 'Поставщики', '⇅'], ['orders', 'Заказы', '▤'], ['support', 'Поддержка', '✉'], ['settings', 'Настройки', '⚙'],
]
const readTab = (): Tab => {
  const t = location.hash.slice(1)
  return TABS.some(x => x[0] === t) ? (t as Tab) : 'overview'
}

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

  if (auth === 'checking') return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-indigo-600" /></div>
  if (auth === 'out') return <><Login onIn={() => { setAuth('in'); reload() }} /><Toaster /></>

  const badges: Partial<Record<Tab, number>> = data ? {
    orders: data.orders.filter(o => o.state === 'attention').length,
    support: data.tickets.filter(t => t.state === 'open').length,
    sources: data.unmatched_count,
  } : {}
  const props = data && { data, reload, go }
  const pages = props && {
    overview: <Overview {...props} />, products: <Products {...props} />, categories: <Categories {...props} />,
    sources: <Sources {...props} />, orders: <Orders {...props} />, support: <Support {...props} />, settings: <Settings {...props} />,
  }

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="sticky top-0 z-30 lg:fixed lg:inset-y-0 lg:left-0 lg:w-60" style={{ background: 'var(--c-bg2)', borderRight: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
        <div className="flex items-center justify-between px-4 py-3 lg:py-5">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">M</span>Управление
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <a href="/" target="_blank" className="rounded-lg px-2 py-1 text-xs transition hover:opacity-80" style={{ color: 'var(--c-muted)' }}>Витрина ↗</a>
            <button onClick={async () => { await api('logout', 'POST').catch(() => {}); setData(null); setAuth('out') }}
              className="rounded-lg px-2 py-1 text-xs transition hover:opacity-80" style={{ color: 'var(--c-muted)' }}>Выйти</button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:px-3">
          {TABS.map(([id, label, icon]) => (
            <button key={id} onClick={() => go(id)}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition`}
              style={tab === id
                ? { background: 'var(--c-accent)', color: '#fff' }
                : { color: 'var(--c-muted)' }
              }
              onMouseEnter={e => { if (tab !== id) e.currentTarget.style.background = 'var(--c-bg3)' }}
              onMouseLeave={e => { if (tab !== id) e.currentTarget.style.background = '' }}>
              <span className="w-4 text-center">{icon}</span>{label}
              {!!badges[id] && <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{badges[id]}</span>}
            </button>
          ))}
        </nav>
      </aside>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        {pages ? pages[tab] : <div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-indigo-600" /></div>}
      </main>
      <Toaster />
    </div>
  )
}

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-bold">Вход в админку</h1>
          <p className="text-sm text-slate-500">Пароль задан в ADMIN_PASSWORD на сервере.</p>
        </div>
        <input type="password" autoFocus autoComplete="current-password" required value={password}
          onChange={e => setPassword(e.target.value)} placeholder="Пароль" className="input" aria-label="Пароль" />
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
        <Button variant="primary" className="w-full" disabled={busy}>{busy ? <Spinner /> : 'Войти'}</Button>
      </form>
    </div>
  )
}
