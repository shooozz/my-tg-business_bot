import { useState } from 'react'
import { api } from '../shared/api'
import type { Category } from '../shared/types'
import { Badge, Button, Empty, Toggle, toast, useAction } from '../shared/ui'
import type { PageProps } from './common'

/** Parents first, children indented under them; guards against cycles. */
function tree(cats: Category[]) {
  const sorted = [...cats].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const out: [Category, number][] = []
  const seen = new Set<number>()
  const walk = (parent: number | null, depth: number) => {
    if (depth > 5) return
    for (const c of sorted.filter(c => c.parent_id === parent && !seen.has(c.id))) {
      seen.add(c.id); out.push([c, depth]); walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  sorted.filter(c => !seen.has(c.id)).forEach(c => out.push([c, 0])) // parent was deleted
  return out
}

export function Categories({ data, reload }: PageProps) {
  const [name, setName] = useState('')
  const { busy, run } = useAction()
  const count = (id: number | null) => data.products.filter(p => p.category_id === id)
  const create = () => run(async () => {
    await api('categories', 'POST', { name: name.trim() }); setName(''); await reload()
  }, 'Категория создана')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Категории</h1>
        <p className="text-sm text-slate-500">Новые категории поставщиков появляются здесь сами. У каждой можно задать свою наценку, заморозить автообновление или разом показать и скрыть все товары.</p>
      </div>
      <form className="card flex gap-2 p-3" onSubmit={e => { e.preventDefault(); if (name.trim()) create() }}>
        <input className="input" placeholder="Новая категория" value={name} maxLength={128} onChange={e => setName(e.target.value)} aria-label="Название категории" />
        <Button variant="primary" disabled={busy || !name.trim()}>Добавить</Button>
      </form>
      <div className="card divide-y divide-slate-100">
        {data.categories.length === 0 && <Empty title="Категорий пока нет" />}
        {tree(data.categories).map(([c, depth]) => (
          <CategoryRow key={`${c.id}:${c.name}:${c.markup_percent}:${c.sort_order}:${c.parent_id}`}
            c={c} depth={depth} ids={count(c.id).map(p => p.id)} all={data.categories} globalMarkup={data.markup_percent} reload={reload} />
        ))}
        {count(null).length > 0 && <div className="px-4 py-3 text-sm text-slate-500">Без категории: {count(null).length} товаров</div>}
      </div>
    </div>
  )
}

function CategoryRow({ c, depth, ids, all, globalMarkup, reload }: {
  c: Category; depth: number; ids: number[]; all: Category[]; globalMarkup: number; reload: () => Promise<void>
}) {
  const [name, setName] = useState(c.name)
  const [markup, setMarkup] = useState(c.markup_percent === null ? '' : String(c.markup_percent))
  const [order, setOrder] = useState(String(c.sort_order))
  const [parent, setParent] = useState<number | null>(c.parent_id)
  const { busy, run } = useAction()
  const dirty = name !== c.name || markup !== (c.markup_percent === null ? '' : String(c.markup_percent))
    || order !== String(c.sort_order) || parent !== c.parent_id

  function put(overrides: Record<string, unknown>, ok: string) {
    const m = markup.trim() === '' ? null : Number(markup.replace(',', '.'))
    if (m !== null && (!Number.isFinite(m) || m < 0 || m > 500)) return toast('Наценка от 0 до 500%', true)
    if (!name.trim()) return toast('Введите название', true)
    run(async () => {
      await api(`categories/${c.id}`, 'PUT', {
        name: name.trim(), parent_id: parent, sort_order: Number(order) || 0,
        auto_update: !!c.auto_update, markup_percent: m, ...overrides,
      })
      await reload()
    }, ok)
  }
  const bulk = (visible: boolean) => run(async () => {
    await api('products/bulk', 'POST', { ids, visible }); await reload()
  }, visible ? 'Показаны товары с ценой' : 'Товары скрыты')
  const remove = () => confirm(`Удалить «${c.name}»? Товары останутся, но без категории.`) &&
    run(async () => { await api(`categories/${c.id}`, 'DELETE'); await reload() }, 'Категория удалена')

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ paddingLeft: 16 + depth * 24 }}>
      {depth > 0 && <span className="text-slate-300">└</span>}
      <input className="input w-48 py-1.5" value={name} onChange={e => setName(e.target.value)} aria-label="Название" />
      <Badge>{ids.length} тов.</Badge>
      <label className="flex items-center gap-1 text-xs text-slate-500">Наценка
        <input className="input w-20 py-1.5" value={markup} placeholder={`${globalMarkup}`} onChange={e => setMarkup(e.target.value)} aria-label="Наценка %" />%</label>
      <label className="flex items-center gap-1 text-xs text-slate-500">Внутри
        <select className="input w-36 py-1.5" value={parent ?? ''} onChange={e => setParent(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— верхний уровень</option>
          {all.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select></label>
      <label className="flex items-center gap-1 text-xs text-slate-500">Порядок
        <input className="input w-16 py-1.5" type="number" value={order} onChange={e => setOrder(e.target.value)} /></label>
      {dirty && <Button variant="primary" disabled={busy} onClick={() => put({}, 'Сохранено')}>Сохранить</Button>}
      <div className="ml-auto flex items-center gap-2">
        <span className="flex items-center gap-2 text-xs text-slate-500" title="Выключите, чтобы поставщик не менял названия и цены в этой категории. Наличие обновляется всегда.">
          Автообновление <Toggle checked={!!c.auto_update} disabled={busy} onChange={v => put({ auto_update: v }, v ? 'Автообновление включено' : 'Категория заморожена')} label="Автообновление" />
        </span>
        {ids.length > 0 && <><Button disabled={busy} onClick={() => bulk(true)}>Показать все</Button>
          <Button disabled={busy} onClick={() => bulk(false)}>Скрыть все</Button></>}
        <Button variant="danger" disabled={busy} onClick={remove} aria-label="Удалить">✕</Button>
      </div>
    </div>
  )
}
