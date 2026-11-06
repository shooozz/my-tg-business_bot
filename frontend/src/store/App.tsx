import { useEffect, useRef, useState } from 'react'
import { api, errText } from '../shared/api'
import type { PublicCategory, PublicProduct } from '../shared/types'
import { Spinner, ThemeToggle } from '../shared/ui'
import { ProductCard } from './ProductCard'
import { ProductView } from './ProductView'

type Shop = { username: string; shop_name: string }
type Page = { products: PublicProduct[]; total: number; page: number }

// The open product lives in the URL hash (#/p/42) so links can be shared.
const readHash = () => Number(location.hash.match(/^#\/p\/(\d+)/)?.[1]) || null

export function App() {
  const [shop, setShop] = useState<Shop>({ username: '', shop_name: '' })
  const [cats, setCats] = useState<PublicCategory[]>([])
  const [cat, setCat] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PublicProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(readHash)
  const req = useRef(0)

  useEffect(() => {
    api<Shop>('public/shop-bot').then(s => { setShop(s); if (s.shop_name) document.title = s.shop_name }).catch(() => {})
    api<{ categories: PublicCategory[] }>('public/categories').then(r => setCats(r.categories)).catch(() => {})
    const onHash = () => setOpen(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t) }, [q])

  async function load(p: number) {
    const mine = ++req.current
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(p) })
    if (cat) params.set('category_id', String(cat))
    if (query) params.set('q', query)
    try {
      const r = await api<Page>('public/products?' + params)
      if (mine !== req.current) return // a newer search already started
      setItems(xs => (p ? [...xs, ...r.products] : r.products)); setTotal(r.total); setPage(p)
    } catch (e) {
      if (mine === req.current) setError(errText(e))
    } finally {
      if (mine === req.current) setLoading(false)
    }
  }
  useEffect(() => { load(0) }, [cat, query]) // eslint-disable-line react-hooks/exhaustive-deps

  const catName = (id: number | null) => cats.find(c => c.id === id)?.name
  const name = shop.shop_name || 'Магазин'
  const chip = (active: boolean) => `whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300'}`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <a href="#" onClick={() => { setCat(null); setQ('') }} className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">{name.charAt(0)}</span>
            <span className="hidden sm:inline">{name}</span>
          </a>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Найти товар…" aria-label="Поиск"
            className="input ml-auto max-w-md rounded-full px-4" />
          <ThemeToggle />
          {shop.username && <a href={`https://t.me/${shop.username}`} target="_blank" rel="noopener"
            className="hidden rounded-full bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white sm:block">Открыть бота</a>}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-10 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Цифровые товары<br /><span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">с мгновенной выдачей</span></h1>
        <p className="mt-3 max-w-xl text-slate-600">Выберите товар, оплатите удобным способом и получите его в Telegram-боте. Поддержка отвечает там же.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-600">
          {['💳 Любые способы оплаты', '⚡ Автовыдача', '🔒 Данные шифруются', '💬 Живая поддержка'].map(t => <span key={t} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">{t}</span>)}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {cats.length > 0 && (
          <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
            <button className={chip(cat === null)} onClick={() => setCat(null)}>Все</button>
            {cats.map(c => <button key={c.id} className={chip(cat === c.id)} onClick={() => setCat(c.id)}>{c.name} <span className="opacity-60">{c.product_count}</span></button>)}
          </div>
        )}
        {error && <p className="py-10 text-center text-slate-500">{error}</p>}
        {!error && !loading && items.length === 0 && (
          <p className="py-16 text-center text-slate-500">{query ? `По запросу «${query}» ничего не нашлось.` : 'Каталог скоро наполнится. Загляните позже.'}</p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map(p => <ProductCard key={p.id} p={p} category={cat ? undefined : catName(p.category_id)} onOpen={() => { location.hash = `/p/${p.id}` }} />)}
        </div>
        <div className="mt-8 flex justify-center">
          {loading ? <Spinner className="h-6 w-6 text-indigo-600" />
            : items.length < total && <button onClick={() => load(page + 1)} className="rounded-full bg-white px-6 py-2.5 text-sm font-medium ring-1 ring-slate-200 hover:ring-slate-300">Показать ещё</button>}
        </div>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} {name}</footer>
      {open && <ProductView id={open} bot={shop.username} category={catName} onClose={() => { location.hash = '' }} />}
    </div>
  )
}
