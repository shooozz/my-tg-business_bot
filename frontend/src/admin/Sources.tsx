import { useEffect, useState } from 'react'
import { api } from '../shared/api'
import { ago, fmt } from '../shared/format'
import type { Offering } from '../shared/types'
import { Badge, Button, Empty, Modal, Spinner, useAction } from '../shared/ui'
import { stockText, type PageProps } from './common'

export function Sources({ data, reload }: PageProps) {
  const [offers, setOffers] = useState<Offering[]>([])
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [linking, setLinking] = useState<Offering | null>(null)
  const { busy, run } = useAction()
  const load = () => api<{ offerings: Offering[] }>('offerings').then(r => setOffers(r.offerings))
  useEffect(() => { load() }, [data.catalog_sync])

  const sync = (provider?: string) => run(async () => {
    try { await api(provider ? `sync?provider=${provider}` : 'sync', 'POST') } finally { await reload(); await load() }
  }, 'Каталог обновлён')

  const byProduct = new Map(data.products.map(p => [p.id, p]))
  const perProduct = new Map<number, number>()
  offers.forEach(o => o.product_id && perProduct.set(o.product_id, (perProduct.get(o.product_id) ?? 0) + 1))
  const rows = offers.filter(o => {
    if (q && !o.name.toLowerCase().includes(q.toLowerCase())) return false
    if (filter === 'dup') return !!o.product_id && (perProduct.get(o.product_id) ?? 0) > 1
    if (filter === 'out') return !o.in_stock || !o.available
    return filter === 'all' || o.provider === filter
  })
  const names = Object.keys(data.providers)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Поставщики</h1>
          <p className="text-sm" style={{ color: 'var(--c-muted)' }}>Обновление {ago(Number(data.catalog_sync))}, автоматически каждые {Math.round(data.sync_period / 60)} мин.</p>
        </div>
        <Button variant="primary" disabled={busy || !names.length} onClick={() => sync()}>{busy ? <Spinner /> : '↻'} Обновить всех</Button>
      </div>

      {data.catalog_error && (
        <p className="card p-3 text-sm" style={{ borderColor: 'var(--c-bad)', background: 'color-mix(in srgb, var(--c-bad) 10%, var(--c-bg2))', color: 'var(--c-bad)' }}>
          Последнее обновление с ошибкой: {data.catalog_error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {names.length === 0 && (
          <div className="card p-4 text-sm" style={{ color: 'var(--c-muted)' }}>
            Нет подключённых поставщиков. Добавьте JAHA_API_KEY или CANBOSO_API_KEY в .env на сервере.
          </div>
        )}
        {names.map(n => (
          <div key={n} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold capitalize" style={{ color: 'var(--c-text)' }}>{n}</span>
              <Badge tone="good">подключён</Badge>
            </div>
            <div className="mt-2 text-2xl font-bold" style={{ color: 'var(--c-text)' }}>
              {n in data.balances ? `${fmt(data.balances[n])} USDT` : '—'}
            </div>
            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>{offers.filter(o => o.provider === n).length} позиций</div>
            <Button className="mt-3" disabled={busy} onClick={() => sync(n)}>Обновить только {n}</Button>
          </div>
        ))}
      </div>

      <div className="card p-4 text-sm" style={{ color: 'var(--c-muted)' }}>
        Одинаковые позиции разных поставщиков объединяются в один товар по названию. Покупатель видит цену самого дешёвого поставщика, у которого товар есть в наличии.
        Если объединилось неверно, нажмите «Перепривязать».
      </div>

      <div className="card overflow-x-auto">
        <div className="flex flex-wrap gap-2 p-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <input className="input max-w-xs" placeholder="Поиск" value={q} onChange={e => setQ(e.target.value)} aria-label="Поиск" />
          <select className="input w-auto" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Фильтр">
            <option value="all">Все позиции</option>
            <option value="dup">Есть у нескольких поставщиков</option>
            <option value="out">Нет в наличии</option>
            {names.map(n => <option key={n} value={n}>Только {n}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <Empty title="Нет позиций" text="Запустите обновление." /> : (
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--c-bg3)' }}>
              <tr>
                <th className="th">Позиция поставщика</th>
                <th className="th">Поставщик</th>
                <th className="th">Закупка</th>
                <th className="th">Наличие</th>
                <th className="th">Товар в магазине</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map(o => {
                const p = o.product_id ? byProduct.get(o.product_id) : undefined
                return (
                  <tr key={o.id} className="transition" style={{ borderTop: '1px solid var(--c-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td className="td">
                      <span style={{ color: 'var(--c-text)' }}>{o.name}</span>
                      <div className="text-xs" style={{ color: 'var(--c-muted)' }}>{o.provider_product_id}</div>
                    </td>
                    <td className="td"><Badge>{o.provider}</Badge></td>
                    <td className="td whitespace-nowrap" style={{ color: 'var(--c-text)' }}>{fmt(o.price_usdt)} USDT</td>
                    <td className="td">
                      {o.in_stock && o.available
                        ? <span style={{ color: 'var(--c-good)' }}>{stockText(o.available)}</span>
                        : <span style={{ color: 'var(--c-bad)' }}>нет</span>}
                    </td>
                    <td className="td">
                      {p
                        ? <>{p.data.title} {p.best_offering_id === o.id
                          ? <Badge tone="good">цена отсюда</Badge>
                          : (perProduct.get(p.id) ?? 0) > 1 && <Badge>дороже / нет</Badge>}</>
                        : <span style={{ color: 'var(--c-muted)' }}>ещё не создан</span>}
                    </td>
                    <td className="td text-right">
                      <Button variant="ghost" onClick={() => setLinking(o)}>Перепривязать</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {linking && <LinkModal o={linking} data={data} onClose={() => setLinking(null)} onDone={async () => { await reload(); await load() }} />}
    </div>
  )
}

function LinkModal({ o, data, onClose, onDone }: { o: Offering; data: PageProps['data']; onClose: () => void; onDone: () => Promise<void> }) {
  const [q, setQ] = useState(o.name.split(' ')[0] ?? '')
  const { busy, run } = useAction()
  const list = data.products.filter(p => (p.data.title ?? '').toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  const link = (pid: number) => run(async () => {
    await api(`offerings/${o.id}/link`, 'PUT', { product_id: pid }); await onDone(); onClose()
  }, 'Позиция привязана')
  return (
    <Modal title={`Привязать «${o.name}»`} onClose={onClose}>
      <input className="input mb-3" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Найти товар магазина" />
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {list.map(p => (
          <button key={p.id} disabled={busy || p.id === o.product_id} onClick={() => link(p.id)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition disabled:opacity-50"
            style={{ color: 'var(--c-text)' }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--c-bg3)' }}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            <span>{p.data.title} <span className="text-xs" style={{ color: 'var(--c-muted)' }}>#{p.id}</span></span>
            {p.id === o.product_id ? <Badge tone="info">сейчас</Badge> : <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{fmt(p.stars)} ★</span>}
          </button>
        ))}
        {!list.length && <p className="py-6 text-center text-sm" style={{ color: 'var(--c-muted)' }}>Ничего не найдено</p>}
      </div>
    </Modal>
  )
}
