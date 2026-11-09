import { useEffect, useState } from 'react'
import { api, errText } from '../shared/api'
import type { PublicProduct } from '../shared/types'
import { Modal, Spinner } from '../shared/ui'
import { Cover } from './ProductCard'

type Detail = PublicProduct & {
  min_quantity: number
  max_quantity: number
  conditions?: string
  warranty?: string
  instructions?: string
  promo_field_label?: string
}
type PayMethods = { stars: boolean; crypto: boolean; rub: boolean }

export function ProductView({ slug, bot, category, onClose }:
  { slug: string; bot: string; category?: (id: number | null) => string | undefined; onClose: () => void }) {
  const [p, setP] = useState<Detail | null>(null)
  const [pay, setPay] = useState<PayMethods | null>(null)
  const [error, setError] = useState('')
  const [promoCode, setPromoCode] = useState('')

  useEffect(() => {
    setP(null); setPay(null); setError(''); setPromoCode('')
    api<Detail>(`public/products/${slug}`).then(setP).catch(e => setError(errText(e)))
    api<PayMethods>('public/pay-methods').then(setPay).catch(() => {})
  }, [slug])

  const buyUrl = bot && pay?.stars ? `https://t.me/${bot}?start=buy_${slug}` : ''
  const buyText = !pay ? 'Загрузка…'
    : pay.stars ? 'Купить в Telegram'
    : pay.crypto || pay.rub ? 'Купить через сайт'
    : 'Покупка скоро откроется'

  return (
    <Modal title={p?.name ?? 'Товар'} onClose={onClose} wide>
      {error && <p className="py-8 text-center" style={{ color: 'var(--c-muted)' }}>{error}</p>}
      {!p && !error && (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-[var(--c-accent)]" /></div>
      )}
      {p && (
        <div className="grid gap-6 sm:grid-cols-[2fr_3fr]">
          <Cover p={p} className="aspect-square w-full rounded-xl" />
          <div className="flex flex-col gap-4">
            {category?.(p.category_id) && (
              <div className="text-sm font-medium" style={{ color: 'var(--c-accent)' }}>{category(p.category_id)}</div>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: 'var(--c-text)' }}>${p.price_usdt.toFixed(2)}</span>
              <span className="text-lg" style={{ color: 'var(--c-muted)' }}>· {Math.round(p.price_rub)} ₽</span>
              <span className="ml-auto text-sm font-normal" style={{ color: 'var(--c-muted)' }}>за 1 шт.</span>
            </div>
            <ul className="space-y-1.5 text-sm" style={{ color: 'var(--c-muted)' }}>
              <li>{p.delivery_type === 'automatic' ? '⚡ Автоматическая выдача сразу после оплаты' : '🕐 Ручная выдача, срок зависит от поставщика'}</li>
              <li>📦 В наличии: {p.available >= 100 ? 'много' : p.available}</li>
              {p.max_quantity > 1 && <li>🔢 За один заказ: от {p.min_quantity} до {p.max_quantity} шт.</li>}
              <li>💬 Поддержка отвечает в Telegram</li>
            </ul>

            {/* Promo code field */}
            {p.promo_field_label && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={p.promo_field_label}
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value)}
                  className="input flex-1 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            {/* Buy button - sticky on mobile */}
            {buyUrl ? (
              <a href={buyUrl} target="_blank" rel="noopener"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white shadow-sm transition sticky-btn-mobile"
                style={{ background: '#229ED9' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1b8cc2')}
                onMouseLeave={e => (e.currentTarget.style.background = '#229ED9')}>
                {buyText}
              </a>
            ) : (
              <button disabled
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold cursor-not-allowed sticky-btn-mobile"
                style={{ background: 'var(--c-bg3)', color: 'var(--c-muted)' }}>
                {buyText}
              </button>
            )}

            <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {pay?.stars && 'Оплата через Telegram Stars в нашем боте. Товар придёт туда же.'}
              {!pay?.stars && (pay?.crypto || pay?.rub) && 'Оплата криптой или рублями скоро откроется.'}
              {pay && !pay.stars && !pay.crypto && !pay.rub && 'Способы оплаты скоро откроются.'}
            </p>

            {/* Main description */}
            {p.description && (
              <div className="whitespace-pre-line border-t pt-4 text-sm leading-relaxed"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
                {p.description}
              </div>
            )}

            {/* Additional sections */}
            {p.conditions && (
              <div className="border-t pt-4">
                <h3 className="mb-2 font-semibold text-sm" style={{ color: 'var(--c-text)' }}>Условия</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>
                  {p.conditions}
                </p>
              </div>
            )}

            {p.warranty && (
              <div className="border-t pt-4">
                <h3 className="mb-2 font-semibold text-sm" style={{ color: 'var(--c-text)' }}>Гарантия</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>
                  {p.warranty}
                </p>
              </div>
            )}

            {p.instructions && (
              <div className="border-t pt-4">
                <h3 className="mb-2 font-semibold text-sm" style={{ color: 'var(--c-text)' }}>Инструкция</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>
                  {p.instructions}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
