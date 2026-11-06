import { useState } from 'react'
import type { PublicProduct } from '../shared/types'

export function Cover({ p, className = '' }: { p: { name: string; image: string; description?: string }; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (p.image && !broken) {
    return <img src={p.image} alt="" loading="lazy" onError={() => setBroken(true)} className={`object-cover ${className}`} />
  }
  // Text tile: first 2–3 words of name + a hint from description.
  const hue = [...p.name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)
  const words = p.name.trim().split(/\s+/)
  const line1 = words.slice(0, 2).join(' ').slice(0, 20)
  const line2 = (words[2] ?? p.description?.split(/\s+/)[0] ?? '').slice(0, 18)
  return (
    <div className={`flex flex-col items-center justify-center gap-1 px-3 text-center ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 32%), hsl(${(hue + 40) % 360} 60% 24%))` }}>
      <span className="text-sm font-bold leading-tight text-white drop-shadow">{line1}</span>
      {line2 && <span className="text-xs leading-tight text-white/70">{line2}</span>}
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
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-slate-900">${p.price_usdt.toFixed(2)}</span>
            <span className="text-sm text-slate-500">· {Math.round(p.price_rub)} ₽</span>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs ${auto ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {auto ? '⚡ Мгновенно' : 'Ручная выдача'}
          </span>
        </div>
      </div>
    </button>
  )
}
