import { useMemo, useState } from 'react'
import { api } from '../shared/api'
import type { Product } from '../shared/types'
import { Button, Empty, toast } from '../shared/ui'
import type { PageProps } from './common'
import { ProductEditor } from './ProductEditor'
import { ProductRow } from './ProductRow'

const PAGE = 100
const STATUSES: [string, string][] = [
  ['all', 'Все'], ['sale', 'На витрине'], ['hidden', 'Скрытые'], ['out', 'Нет в наличии'], ['locked', 'С ручными правками'],
]

export function Products({ data, reload }: PageProps) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [status, setStatus] = useState('all')
  const [prov, setProv] = useState('all')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<Product | null>(null)
  const catName = useMemo(() => new Map(data.categories.map(c => [c.id, c.name])), [data.categories])
  const providers = [...new Set(data.products.map(p => p.provider))]

  const rows = data.products.filter(p => {
    const text = `${p.data.title ?? ''} ${p.code} ${catName.get(p.category_id ?? -1) ?? ''}`.toLowerCase()
    if (q && !text.includes(q.toLowerCase())) return false
    if (cat === 'none' ? p.category_id !== null : cat !== 'all' && p.category_id !== Number(cat)) return false
    if (prov !== 'all' && p.provider !== prov) return false
    const stock = (p.data.available ?? 0) > 0
    if (status === 'sale') return !!p.visible && p.stars > 0 && stock
    if (status === 'hidden') return !p.visible
    if (status === 'out') return !stock
    if (status === 'locked') return !!(p.name_locked || p.description_locked || p.price_locked || p.category_locked)
    return true
  })
  const shown = rows.slice(0, limit)

  async function save(id: number, patch: Record<string, unknown>) {
    try {
      await api(`products/${id}`, 'PUT', patch)
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', true)
    }
  }
  async function bulk(patch: Record<string, unknown>, ok: string) {
    try {
      await api('products/bulk', 'POST', { ids: [...sel], ...patch })
      setSel(new Set()); await reload(); toast(ok)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', true)
    }
  }
  const select = (id: number, v: boolean) => setSel(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n })
  const allShown = shown.length > 0 && shown.every(p => sel.has(p.id))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Товары</h1>
        <p className="text-sm text-slate-500">Цены считаются автоматически: закупка × наценка × курс. Изменённое вручную поле перестаёт обновляться от поставщика.</p>
      </div>

      <div className="card flex flex-wrap gap-2 p-3">
        <input className="input max-w-xs flex-1" placeholder="Поиск по названию, коду, категории" value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE) }} aria-label="Поиск" />
        <select className="input w-auto" value={cat} onChange={e => setCat(e.target.value)} aria-label="Категория">
          <option value="all">Все категории</option><option value="none">Без категории</option>
          {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)} aria-label="Статус">
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {providers.length > 1 && (
          <select className="input w-auto" value={prov} onChange={e => setProv(e.target.value)} aria-label="Поставщик">
            <option value="all">Все поставщики</option>{providers.map(p => <option key={p}>{p}</option>)}
          </select>
        )}
        <span className="ml-auto self-center text-sm text-slate-500">{rows.length} из {data.products.length}</span>
      </div>

      {sel.size > 0 && (
        <div className="card sticky top-28 z-20 flex flex-wrap items-center gap-2 border-indigo-200 bg-indigo-50 p-3 lg:top-2">
          <span className="text-sm font-medium">Выбрано: {sel.size}</span>
          <Button onClick={() => bulk({ visible: true }, 'Показаны товары с ценой')}>Показать</Button>
          <Button onClick={() => bulk({ visible: false }, 'Скрыто')}>Скрыть</Button>
          <select className="input w-auto" value="" aria-label="Переместить в категорию"
            onChange={e => e.target.value && bulk({ category_id: e.target.value === 'none' ? null : Number(e.target.value) }, 'Категория изменена')}>
            <option value="">Переместить в категорию…</option><option value="none">Без категории</option>
            {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button variant="ghost" onClick={() => setSel(new Set())}>Снять выделение</Button>
        </div>
      )}

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty title={data.products.length ? 'Ничего не найдено' : 'Каталог пуст'}
            text={data.products.length ? 'Измените фильтры.' : 'Запустите синхронизацию на странице «Поставщики».'} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <th className="th"><input type="checkbox" checked={allShown} aria-label="Выбрать все"
                onChange={e => setSel(e.target.checked ? new Set([...sel, ...shown.map(p => p.id)]) : new Set())} /></th>
              <th className="th">Товар</th><th className="th">Категория</th><th className="th">Закупка</th>
              <th className="th">Цена ★</th><th className="th">Витрина</th><th className="th" />
            </tr></thead>
            <tbody>
              {shown.map(p => <ProductRow key={p.id} p={p} data={data} selected={sel.has(p.id)}
                onSelect={v => select(p.id, v)} save={save} onEdit={() => setEditing(p)} />)}
            </tbody>
          </table>
        )}
        {rows.length > limit && <div className="border-t border-slate-100 p-3 text-center">
          <Button onClick={() => setLimit(l => l + PAGE)}>Показать ещё {Math.min(PAGE, rows.length - limit)}</Button></div>}
      </div>
      {editing && <ProductEditor p={editing} data={data} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  )
}
