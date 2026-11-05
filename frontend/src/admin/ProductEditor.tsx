import { useState, type ReactNode } from 'react'
import { api } from '../shared/api'
import { autoStars, fmt } from '../shared/format'
import type { Dashboard, Product } from '../shared/types'
import { Button, Modal, Spinner, Toggle, toast, useAction } from '../shared/ui'
import { markupFor } from './common'

function Field({ label, auto, onAuto, hint, children }:
  { label: string; auto: boolean; onAuto: (v: boolean) => void; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {auto ? 'Автообновление' : 'Своё значение'}
          <Toggle checked={auto} onChange={onAuto} label={`Автообновление: ${label}`} />
        </span>
      </div>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

/** Each field either follows the supplier (auto) or keeps the admin's own value. */
export function ProductEditor({ p, data, onClose, onSaved }:
  { p: Product; data: Dashboard; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(p.data.title ?? '')
  const [desc, setDesc] = useState(p.data.description ?? '')
  const [cat, setCat] = useState<number | null>(p.category_id)
  const [stars, setStars] = useState(String(p.stars))
  const [visible, setVisible] = useState(!!p.visible)
  const [auto, setAuto] = useState({ name: !p.name_locked, description: !p.description_locked, category: !p.category_locked, price: !p.price_locked })
  const { busy, run } = useAction()
  const markup = markupFor(data, cat)
  const autoPrice = autoStars(p.base_price_usdt, markup, data.usdt_to_stars_rate)
  const flip = (k: keyof typeof auto) => (v: boolean) => setAuto(a => ({ ...a, [k]: v }))

  function submit() {
    const patch: Record<string, unknown> = {
      visible, name_locked: !auto.name, description_locked: !auto.description,
      category_locked: !auto.category, price_locked: !auto.price,
    }
    if (!auto.name) {
      if (!name.trim()) return toast('Введите название', true)
      patch.name = name.trim()
    }
    if (!auto.description) patch.description = desc
    if (!auto.category) patch.category_id = cat
    if (!auto.price) {
      const n = Number(stars)
      if (!Number.isInteger(n) || n < 1 || n > 1000000) return toast('Цена от 1 до 1 000 000 ★', true)
      patch.stars = n
    }
    run(async () => { await api(`products/${p.id}`, 'PUT', patch); await onSaved(); onClose() }, 'Товар сохранён')
  }

  const off = 'Поставщик не сможет изменить это поле, пока автообновление выключено.'
  return (
    <Modal title={`Товар #${p.id}`} onClose={onClose} wide footer={<>
      <Button onClick={onClose}>Отмена</Button>
      <Button variant="primary" onClick={submit} disabled={busy}>{busy && <Spinner />}Сохранить</Button>
    </>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <span>Поставщик: <b>{p.provider}</b> · закупка {fmt(p.base_price_usdt)} USDT · {p.code}</span>
          <span className="flex items-center gap-2">На витрине <Toggle checked={visible} onChange={setVisible} label="На витрине" /></span>
        </div>
        <Field label="Название" auto={auto.name} onAuto={flip('name')} hint={auto.name ? undefined : off}>
          <input className="input" value={name} disabled={auto.name} maxLength={256} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label="Описание" auto={auto.description} onAuto={flip('description')} hint={auto.description ? undefined : off}>
          <textarea className="input min-h-28" value={desc} disabled={auto.description} maxLength={4000} onChange={e => setDesc(e.target.value)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Категория" auto={auto.category} onAuto={flip('category')}>
            <select className="input" value={cat ?? ''} disabled={auto.category} onChange={e => setCat(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Без категории</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Цена, ★" auto={auto.price} onAuto={flip('price')}
            hint={auto.price ? `${fmt(p.base_price_usdt)} USDT × (1 + ${fmt(markup)}%) × ${fmt(data.usdt_to_stars_rate)} ≈ ${fmt(autoPrice)} ★` : off}>
            <input type="number" min={1} max={1000000} className="input" disabled={auto.price}
              value={auto.price ? String(autoPrice) : stars} onChange={e => setStars(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
