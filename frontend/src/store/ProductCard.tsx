import { useState } from 'react'
import { fmt } from '../shared/format'
import type { PublicProduct } from '../shared/types'

export function Cover({ p, className = '' }: { p: { name: string; image: string }; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (p.image && !broken) {
    return <img src={p.image} alt="" loading="lazy" onError={() => setBroken(true)} className={`object-cover ${className}`} />
  }
  // Letter tile; hue derived from the name so each product keeps its colour.
  const hue = [...p.name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)
  return (
    <div className={`flex items-center justify-center text-3xl font-bold text-white ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}>
      {p.name.trim().charAt(0).toUpperCase() || '•'}
    </div>
  )
}

export function ProductCard({ p, category, onOpen }: { p: PublicProduct; category?: string; onOpen: () => void }) {
  const auto = p.delivery_type === 'automatic'
  return (
    <button onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
      <Cover p={p} className="aspect-[16/10] w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        {category && <div className="text-xs font-medium text-indigo-600">{category}</div>}
        <div className="line-clamp-2 font-semibold leading-snug text-slate-900">{p.name}</div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-bold">{fmt(p.stars)} <span className="text-amber-500">★</span></span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${auto ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {auto ? '⚡ Мгновенно' : 'Ручная выдача'}
          </span>
        </div>
      </div>
    </button>
  )
}
