import { useEffect, useState } from 'react'
import { api, errText } from '../shared/api'
import type { PublicProduct } from '../shared/types'
import { Modal, Spinner } from '../shared/ui'

type ServiceDetail = {
  id: number
  name: string
  slug: string
  description: string
  image: string
  emoji: string
}

type FilteredProduct = PublicProduct & {
  min_quantity: number
  max_quantity: number
  variants?: string[] // Different variants/tiers
  regions?: string[]
  delivery_terms?: string[]
}

export function ServiceView({ slug, onClose, onOpenProduct }:
  { slug: string; onClose: () => void; onOpenProduct: (slug: string) => void }) {
  const [service, setService] = useState<ServiceDetail | null>(null)
  const [products, setProducts] = useState<FilteredProduct[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedVariant, setSelectedVariant] = useState<string>('')
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedTerm, setSelectedTerm] = useState<string>('')

  // Extract unique options from products
  const variants = [...new Set(products.flatMap(p => p.variants || []))]
  const regions = [...new Set(products.flatMap(p => p.regions || []))]
  const terms = [...new Set(products.flatMap(p => p.delivery_terms || []))]

  // Filter products based on selections
  const filtered = products.filter(p => {
    if (selectedVariant && p.variants && !p.variants.includes(selectedVariant)) return false
    if (selectedRegion && p.regions && !p.regions.includes(selectedRegion)) return false
    if (selectedTerm && p.delivery_terms && !p.delivery_terms.includes(selectedTerm)) return false
    return true
  })

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api<ServiceDetail>(`public/services/${slug}`),
      api<{ products: FilteredProduct[] }>(`public/services/${slug}/products`),
    ])
      .then(([svc, { products: prods }]) => {
        setService(svc)
        setProducts(prods)
        if (prods.length > 0) {
          // Set defaults
          if (prods[0].variants?.length) setSelectedVariant(prods[0].variants[0])
          if (prods[0].regions?.length) setSelectedRegion(prods[0].regions[0])
          if (prods[0].delivery_terms?.length) setSelectedTerm(prods[0].delivery_terms[0])
        }
      })
      .catch(e => setError(errText(e)))
      .finally(() => setLoading(false))
  }, [slug])

  if (!service) {
    return (
      <Modal title="Сервис" onClose={onClose} wide>
        {error && <p className="py-8 text-center text-red-500">{error}</p>}
        {loading && <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>}
      </Modal>
    )
  }

  const bestProduct = filtered[0]

  return (
    <Modal title={service.name} onClose={onClose} wide>
      <div className="grid gap-6 sm:grid-cols-[2fr_3fr]">
        {/* Image */}
        <div className="aspect-square w-full rounded-xl overflow-hidden" style={{ background: 'var(--c-bg3)' }}>
          {service.image ? (
            <img src={service.image} alt={service.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full text-4xl">
              {service.emoji || '📦'}
            </div>
          )}
        </div>

        {/* Details and selections */}
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium" style={{ color: 'var(--c-accent)' }}>
            {service.emoji} {service.name}
          </div>

          <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>
            {service.description}
          </p>

          {/* Selection filters */}
          {variants.length > 1 && (
            <div>
              <label className="text-xs font-semibold uppercase" style={{ color: 'var(--c-muted)' }}>Вариант</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {variants.map(v => (
                  <button
                    key={v}
                    onClick={() => setSelectedVariant(v)}
                    className="chip text-sm"
                    style={{
                      background: selectedVariant === v ? 'var(--c-accent)' : 'var(--c-bg3)',
                      color: selectedVariant === v ? 'white' : 'var(--c-text)',
                    }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {regions.length > 1 && (
            <div>
              <label className="text-xs font-semibold uppercase" style={{ color: 'var(--c-muted)' }}>Регион</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {regions.map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRegion(r)}
                    className="chip text-sm"
                    style={{
                      background: selectedRegion === r ? 'var(--c-accent)' : 'var(--c-bg3)',
                      color: selectedRegion === r ? 'white' : 'var(--c-text)',
                    }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {terms.length > 1 && (
            <div>
              <label className="text-xs font-semibold uppercase" style={{ color: 'var(--c-muted)' }}>Срок</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {terms.map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedTerm(t)}
                    className="chip text-sm"
                    style={{
                      background: selectedTerm === t ? 'var(--c-accent)' : 'var(--c-bg3)',
                      color: selectedTerm === t ? 'white' : 'var(--c-text)',
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected product preview */}
          {bestProduct && (
            <>
              <div className="border-t" style={{ borderColor: 'var(--c-border)' }}></div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: 'var(--c-text)' }}>
                  ${bestProduct.price_usdt.toFixed(2)}
                </span>
                <span className="text-lg" style={{ color: 'var(--c-muted)' }}>
                  · {Math.round(bestProduct.price_rub)} ₽
                </span>
              </div>

              <ul className="space-y-1.5 text-sm" style={{ color: 'var(--c-muted)' }}>
                <li>{bestProduct.delivery_type === 'automatic' ? '⚡ Автоматическая выдача' : '🕐 Ручная выдача'}</li>
                <li>📦 В наличии: {bestProduct.available >= 100 ? 'много' : bestProduct.available}</li>
              </ul>

              {/* Buy button */}
              <button
                onClick={() => onOpenProduct(bestProduct.code || String(bestProduct.id))}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white shadow-sm transition"
                style={{ background: '#229ED9' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1b8cc2')}
                onMouseLeave={e => (e.currentTarget.style.background = '#229ED9')}>
                Выбрать и купить
              </button>
            </>
          )}

          {!bestProduct && filtered.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
              Нет товаров с выбранными параметрами
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
