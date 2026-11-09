import { useEffect, useRef, useState } from 'react'
import { api, errText } from '../shared/api'
import type { PublicCategory, PublicProduct } from '../shared/types'
import { Spinner, ThemeToggle, Toaster } from '../shared/ui'
import { ProductCard } from './ProductCard'
import { ProductView } from './ProductView'
import { ServiceView } from './ServiceView'
import {
  AutoDeliverySection,
  CategoryTasks,
  Hero,
  HowItWorks,
  PopularServices,
  ProductsSection,
  SupportStrip,
} from './Home'

type Shop = { username: string; shop_name: string }
type Page = { products: PublicProduct[]; total: number; page: number }
type RouteMatch = { type: 's' | 'p'; slug: string } | null

// Parse URL path to determine current view
const parseUrl = (): RouteMatch => {
  const path = location.pathname
  const match = path.match(/^\/([sp])\/(.+)$/)
  if (match) {
    return { type: match[1] as 's' | 'p', slug: match[2] }
  }
  return null
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({ name, username, onHome, onCatalog }:
  { name: string; username: string;
    onHome: () => void; onCatalog: () => void }) {
  return (
    <header className="sticky top-0 z-30 header-bg">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <a href="/" onClick={e => { e.preventDefault(); onHome() }} className="flex items-center gap-2 font-bold">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm">
            {name.charAt(0)}
          </span>
          <span className="hidden sm:inline font-bold" style={{ color: 'var(--c-text)' }}>{name}</span>
        </a>

        {/* Search — clicking it enters catalog mode */}
        <button
          onClick={onCatalog}
          className="input ml-auto flex max-w-xs items-center gap-2 rounded-full px-4 text-left sm:max-w-md"
          style={{ color: 'var(--c-muted)' }}>
          <span className="text-base">🔍</span>
          <span className="text-sm">Найти товар…</span>
        </button>

        <ThemeToggle />
        {username && (
          <a href={`https://t.me/${username}`} target="_blank" rel="noopener"
            className="hidden shrink-0 rounded-full bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white sm:block">
            Открыть бота
          </a>
        )}
      </div>
    </header>
  )
}

// ── Catalog header (search active) ───────────────────────────────────────────

function CatalogHeader({ username, q, onQ, onBack }:
  { username: string; q: string; onQ: (v: string) => void; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 header-bg">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <button onClick={onBack} aria-label="На главную"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
          style={{ background: 'var(--c-bg3)', color: 'var(--c-text)' }}>
          ←
        </button>
        <input value={q} onChange={e => onQ(e.target.value)}
          autoFocus
          placeholder="Найти товар…" aria-label="Поиск"
          className="input flex-1 rounded-full px-4" />
        <ThemeToggle />
        {username && (
          <a href={`https://t.me/${username}`} target="_blank" rel="noopener"
            className="hidden shrink-0 rounded-full bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white sm:block">
            Открыть бота
          </a>
        )}
      </div>
    </header>
  )
}

// ── Catalog view (search/filter results) ─────────────────────────────────────

function CatalogView({ cats, q, cat, onCat, onOpen, catName }:
  { cats: PublicCategory[]; q: string;
    cat: number | null; onCat: (id: number | null) => void;
    onOpen: (slug: string) => void; catName: (id: number | null) => string | undefined }) {
  const [items, setItems] = useState<PublicProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const req = useRef(0)

  async function load(p: number) {
    const mine = ++req.current
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(p) })
    if (cat) params.set('category_id', String(cat))
    if (q.trim()) params.set('q', q.trim())
    try {
      const r = await api<Page>('public/products?' + params)
      if (mine !== req.current) return
      setItems(xs => (p ? [...xs, ...r.products] : r.products))
      setTotal(r.total); setPage(p)
    } catch (e) {
      if (mine === req.current) setError(errText(e))
    } finally {
      if (mine === req.current) setLoading(false)
    }
  }

  useEffect(() => { load(0) }, [cat, q]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-4">
      {/* Category filter pills */}
      {cats.length > 0 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => onCat(null)}
            className={`chip shrink-0 ${cat === null ? 'active' : ''}`}>
            Все
          </button>
          {cats.map(c => (
            <button key={c.id} onClick={() => onCat(c.id)}
              className={`chip shrink-0 ${cat === c.id ? 'active' : ''}`}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="py-10 text-center text-sm" style={{ color: 'var(--c-muted)' }}>{error}</p>}
      {!error && !loading && items.length === 0 && (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--c-muted)' }}>
          {q.trim() ? `По запросу «${q.trim()}» ничего не нашлось.` : 'Каталог скоро наполнится.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map(p => (
          <ProductCard key={p.id} p={p}
            category={cat ? undefined : catName(p.category_id)}
            onOpen={() => onOpen(p.code || String(p.id))} />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        {loading
          ? <Spinner className="h-6 w-6 text-[var(--c-accent)]" />
          : items.length < total && (
            <button onClick={() => load(page + 1)} className="chip">Показать ещё</button>
          )}
      </div>
    </main>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export function App() {
  const [shop, setShop] = useState<Shop>({ username: '', shop_name: '' })
  const [cats, setCats] = useState<PublicCategory[]>([])
  const [view, setView] = useState<'home' | 'catalog'>('home')
  const [route, setRoute] = useState<RouteMatch>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<number | null>(null)

  // Products per home section
  const [popular, setPopular] = useState<PublicProduct[]>([])
  const [newest, setNewest] = useState<PublicProduct[]>([])
  const [autoDelivery, setAutoDelivery] = useState<PublicProduct[]>([])
  const [loadingHome, setLoadingHome] = useState(true)

  // Load shop and categories
  useEffect(() => {
    api<Shop>('public/shop-bot').then(s => {
      setShop(s)
      if (s.shop_name) document.title = s.shop_name
    }).catch(() => {})

    api<{ categories: PublicCategory[] }>('public/categories')
      .then(r => setCats(r.categories)).catch(() => {})

    // Load home sections in parallel
    Promise.all([
      api<Page>('public/products?page=0').catch(() => ({ products: [], total: 0, page: 0 } as Page)),
    ]).then(([all]) => {
      const ps = all.products
      setPopular(ps.slice(0, 4))
      setNewest(ps.slice(0, 4))
      setAutoDelivery(ps.filter(p => p.delivery_type === 'automatic').slice(0, 4))
      setLoadingHome(false)
    })
  }, [])

  // Listen for URL changes (back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseUrl()
      setRoute(parsed)
      if (!parsed) setView('home')
    }

    handlePopState()
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const catName = (id: number | null) => cats.find(c => c.id === id)?.name

  function navigateTo(path: string) {
    history.pushState(null, '', path)
    const parsed = parseUrl()
    setRoute(parsed)
    if (!parsed) setView('home')
  }

  function openProduct(slug: string) {
    navigateTo(`/p/${slug}`)
  }

  function enterCatalog(catId?: number | null, query?: string) {
    if (catId !== undefined) setCat(catId)
    if (query !== undefined) setQ(query)
    setView('catalog')
  }

  function goHome() {
    navigateTo('/')
    setView('home')
    setCat(null)
    setQ('')
  }

  const name = shop.shop_name || 'Магазин'

  return (
    <div className="min-h-screen" style={{ background: 'var(--c-bg)' }}>
      {!route && view === 'home' ? (
        <Header name={name} username={shop.username}
          onHome={goHome} onCatalog={() => setView('catalog')} />
      ) : !route ? (
        <CatalogHeader username={shop.username} q={q} onQ={setQ} onBack={goHome} />
      ) : (
        <Header name={name} username={shop.username}
          onHome={goHome} onCatalog={() => setView('catalog')} />
      )}

      {!route && view === 'home' && (
        <>
          <Hero onCatalog={() => setView('catalog')} />

          <PopularServices cats={cats} onSelect={id => enterCatalog(id)} />

          <ProductsSection title="Популярное" emoji="🔥"
            items={popular} loading={loadingHome} catName={catName}
            onOpen={openProduct} onSeeAll={() => enterCatalog(null)} />

          <ProductsSection title="Новинки" emoji="✨"
            items={newest} loading={loadingHome} catName={catName}
            onOpen={openProduct} onSeeAll={() => enterCatalog(null)} />

          <AutoDeliverySection
            items={autoDelivery} loading={loadingHome} catName={catName}
            onOpen={openProduct} onSeeAll={() => enterCatalog(null)} />

          <CategoryTasks cats={cats} onSelect={(id, q) => enterCatalog(id, q)} />

          <HowItWorks />

          <SupportStrip botUsername={shop.username} />

          <footer className="py-6 text-center text-sm" style={{ color: 'var(--c-muted)' }}>
            © {new Date().getFullYear()} {name}
          </footer>
        </>
      )}

      {!route && view === 'catalog' && (
        <CatalogView cats={cats} q={q} cat={cat} onCat={setCat}
          onOpen={openProduct} catName={catName} />
      )}

      {route?.type === 'p' && (
        <ProductView slug={route.slug} bot={shop.username} category={catName}
          onClose={goHome} />
      )}

      {route?.type === 's' && (
        <ServiceView slug={route.slug}
          onClose={goHome} onOpenProduct={openProduct} />
      )}

      <Toaster />
    </div>
  )
}
