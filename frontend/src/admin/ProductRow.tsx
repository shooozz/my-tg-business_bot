import { useEffect, useState } from 'react'
import { autoStars, fmt } from '../shared/format'
import type { Dashboard, Product } from '../shared/types'
import { Badge, Toggle, toast } from '../shared/ui'
import { isFrozen, markupFor, stockText } from './common'

export type Save = (id: number, patch: Record<string, unknown>) => Promise<void>

export function ProductRow({ p, data, selected, onSelect, save, onEdit }: {
  p: Product; data: Dashboard; selected: boolean; onSelect: (v: boolean) => void; save: Save; onEdit: () => void
}) {
  const [price, setPrice] = useState(String(p.stars))
  useEffect(() => setPrice(String(p.stars)), [p.stars])
  const markup = markupFor(data, p.category_id)
  const auto = autoStars(p.base_price_usdt, markup, data.usdt_to_stars_rate)
  const stock = p.data.available ?? 0

  function commit() {
    const n = Number(price)
    if (!Number.isInteger(n) || n < 1 || n > 1000000) {
      toast('Цена от 1 до 1 000 000 ★', true)
      setPrice(String(p.stars))
      return
    }
    // A hand-typed price turns off price auto-update for this product (backend locks it).
    if (n !== p.stars) save(p.id, { stars: n })
  }

  return (
    <tr className={`border-t transition ${selected ? '' : 'hover:bg-[var(--c-bg3)]/40'}`}
      style={selected ? { background: 'color-mix(in srgb, var(--c-accent) 8%, var(--c-bg2))' } : { borderColor: 'var(--c-border)' }}>
      <td className="td w-8"><input type="checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} aria-label="Выбрать" /></td>
      <td className="td min-w-64">
        <button onClick={onEdit} className="text-left font-medium transition hover:opacity-70" style={{ color: 'var(--c-text)' }}>{p.data.title || p.code}</button>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" style={{ color: 'var(--c-muted)' }}>
          <span>#{p.id} · {p.provider} ·</span>
          {stock > 0 ? <span>в наличии {stockText(stock)}</span> : <span style={{ color: 'var(--c-bad)' }}>нет в наличии</span>}
          {!!p.name_locked && <Badge tone="info">своё название</Badge>}
          {!!p.description_locked && <Badge tone="info">своё описание</Badge>}
          {isFrozen(data, p.category_id) && <Badge tone="warn">категория заморожена</Badge>}
        </div>
      </td>
      <td className="td">
        <select className="input w-40 py-1.5" value={p.category_id ?? ''} aria-label="Категория"
          onChange={e => save(p.id, { category_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Без категории</option>
          {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!!p.category_locked && <button className="mt-1 block text-xs hover:underline" style={{ color: 'var(--c-accent)' }} onClick={() => save(p.id, { category_locked: false })}>↺ как у поставщика</button>}
      </td>
      <td className="td whitespace-nowrap text-sm" style={{ color: 'var(--c-muted)' }}>{fmt(p.base_price_usdt)} USDT</td>
      <td className="td">
        <input type="number" min={1} max={1000000} value={price} aria-label="Цена в Stars" className="input w-24 py-1.5"
          onChange={e => setPrice(e.target.value)} onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
        <div className="mt-1 whitespace-nowrap text-xs">
          {p.price_locked
            ? <button className="hover:underline" style={{ color: 'var(--c-accent)' }} title="Вернуть автоматическую цену" onClick={() => save(p.id, { price_locked: false })}>🔒 своя · ↺ авто {fmt(auto)}</button>
            : <span style={{ color: 'var(--c-muted)' }}>авто · наценка {fmt(markup)}%</span>}
        </div>
      </td>
      <td className="td">
        <Toggle checked={!!p.visible} label="На витрине" onChange={v => {
          if (v && p.stars < 1) { toast('Сначала укажите цену', true); return }
          save(p.id, { visible: v })
        }} />
      </td>
      <td className="td text-right">
        <button onClick={onEdit} aria-label="Редактировать"
          className="rounded-lg px-2 py-1 transition hover:opacity-80"
          style={{ color: 'var(--c-muted)' }}>✎</button>
      </td>
    </tr>
  )
}
