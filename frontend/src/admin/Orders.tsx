import { useState } from 'react'
import { api } from '../shared/api'
import { date, fmt, statusLabel, statusTone } from '../shared/format'
import { Badge, Button, Empty, useAction } from '../shared/ui'
import type { PageProps } from './common'

export function Orders({ data, reload }: PageProps) {
  const [q, setQ] = useState('')
  const [state, setState] = useState('all')
  const { busy, run } = useAction()
  const title = new Map(data.products.map(p => [p.id, p.data.title ?? p.code]))
  const states = [...new Set(data.orders.map(o => o.state))]
  const rows = data.orders.filter(o =>
    (state === 'all' || o.state === state) &&
    (!q || `${o.id} ${o.user_id} ${o.supplier_number ?? ''} ${title.get(o.product_id) ?? ''}`.toLowerCase().includes(q.toLowerCase())))

  const check = (id: string) => run(async () => { await api(`orders/${id}/check`, 'POST'); await reload() }, 'Статус обновлён')
  const refund = (id: string) => confirm('Вернуть покупателю Stars? Это возможно только после подтверждённого отказа или возврата поставщика.') &&
    run(async () => { await api(`orders/${id}/refund`, 'POST'); await reload() }, 'Возврат поставлен в очередь')

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Заказы</h1><p className="text-sm text-slate-500">Последние 200 оплаченных заказов.</p></div>
      <div className="card flex flex-wrap gap-2 p-3">
        <input className="input max-w-xs" placeholder="Номер, клиент, товар" value={q} onChange={e => setQ(e.target.value)} aria-label="Поиск" />
        <select className="input w-auto" value={state} onChange={e => setState(e.target.value)} aria-label="Статус">
          <option value="all">Все статусы</option>{states.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="Заказов нет" text="Оплаченные заказы появятся здесь." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="th">Заказ</th><th className="th">Товар</th><th className="th">Сумма</th><th className="th">Статус</th><th className="th">Создан</th><th className="th" /></tr></thead>
            <tbody>{rows.map(o => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="td" title={o.id}>#{o.id.slice(0, 8)}<div className="text-xs text-slate-400">TG {o.user_id} · {o.provider}{o.supplier_number ? ` · ${o.supplier_number}` : ''}</div></td>
                <td className="td">{title.get(o.product_id) ?? `#${o.product_id}`}</td>
                <td className="td whitespace-nowrap">{fmt(o.stars)} ★</td>
                <td className="td"><Badge tone={statusTone(o.state)}>{statusLabel(o.state)}</Badge>{o.error && <div className="mt-1 text-xs text-rose-600">{o.error}</div>}</td>
                <td className="td whitespace-nowrap text-slate-500">{date(o.created)}</td>
                <td className="td whitespace-nowrap text-right">
                  {o.supplier_number && <Button variant="ghost" disabled={busy} onClick={() => check(o.id)}>Проверить</Button>}
                  {['refunded', 'attention'].includes(o.state) && <Button variant="danger" disabled={busy} onClick={() => refund(o.id)}>Возврат</Button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
