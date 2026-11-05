import { useEffect, useState } from 'react'
import { api, errText } from '../shared/api'
import { fmt } from '../shared/format'
import type { PublicProduct } from '../shared/types'
import { Modal, Spinner } from '../shared/ui'
import { Cover } from './ProductCard'

type Detail = PublicProduct & { min_quantity: number; max_quantity: number }

export function ProductView({ id, bot, category, onClose }:
  { id: number; bot: string; category?: (id: number | null) => string | undefined; onClose: () => void }) {
  const [p, setP] = useState<Detail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setP(null); setError('')
    api<Detail>(`public/products/${id}`).then(setP).catch(e => setError(errText(e)))
  }, [id])

  const buyUrl = bot ? `https://t.me/${bot}?start=buy_${id}` : ''
  return (
    <Modal title={p?.name ?? 'Товар'} onClose={onClose} wide>
      {error && <p className="py-8 text-center text-slate-500">{error}</p>}
      {!p && !error && <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-indigo-600" /></div>}
      {p && (
        <div className="grid gap-6 sm:grid-cols-[2fr_3fr]">
          <Cover p={p} className="aspect-square w-full rounded-xl" />
          <div className="flex flex-col gap-4">
            {category?.(p.category_id) && <div className="text-sm font-medium text-indigo-600">{category(p.category_id)}</div>}
            <div className="text-3xl font-bold">{fmt(p.stars)} <span className="text-amber-500">★</span>
              <span className="ml-2 text-sm font-normal text-slate-500">за 1 шт.</span></div>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li>{p.delivery_type === 'automatic' ? '⚡ Автоматическая выдача сразу после оплаты' : '🕐 Ручная выдача, срок зависит от поставщика'}</li>
              <li>📦 В наличии: {p.available >= 100 ? 'много' : fmt(p.available)}</li>
              {p.max_quantity > 1 && <li>🔢 За один заказ: от {p.min_quantity} до {p.max_quantity} шт.</li>}
              <li>💬 Поддержка отвечает в Telegram</li>
            </ul>
            {buyUrl ? (
              <a href={buyUrl} target="_blank" rel="noopener"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[#1b8cc2]">
                Купить в Telegram
              </a>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Покупка скоро откроется.</p>
            )}
            <p className="text-xs text-slate-500">Оплата через Telegram Stars в нашем боте. Товар придёт туда же.</p>
            {p.description && <div className="whitespace-pre-line border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-700">{p.description}</div>}
          </div>
        </div>
      )}
    </Modal>
  )
}
