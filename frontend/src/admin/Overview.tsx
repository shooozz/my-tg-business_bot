import type { ReactNode } from 'react'
import { api } from '../shared/api'
import { ago, date, fmt } from '../shared/format'
import { Badge, Button, Spinner, useAction } from '../shared/ui'
import type { PageProps } from './common'

function Stat({ label, value, hint, onClick }: { label: string; value: ReactNode; hint?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="card p-4 text-left transition enabled:hover:border-indigo-200 enabled:hover:shadow-md">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </button>
  )
}

export function Overview({ data, reload, go }: PageProps) {
  const { busy, run } = useAction()
  const inStock = data.products.filter(p => (p.data.available ?? 0) > 0)
  const onSale = inStock.filter(p => p.visible && p.stars > 0).length
  const attention = data.orders.filter(o => o.state === 'attention')
  const open = data.tickets.filter(t => t.state === 'open').length
  const last = Number(data.catalog_sync) || 0
  const totalBalance = Object.values(data.balances).reduce((a, b) => a + b, 0)
  const sync = () => run(async () => {
    try { await api('sync', 'POST') } finally { await reload() }
  }, 'Каталог обновлён')

  const setup: [boolean, string][] = [
    [data.supplier_configured, 'Ключ поставщика (JAHA_API_KEY или CANBOSO_API_KEY)'],
    [data.configured.shop, 'Токен бота магазина'], [data.configured.admin, 'Токен бота администратора'],
    [data.configured.support, 'Токен бота поддержки'],
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Обзор</h1>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {setup.some(([ok]) => !ok) && (
        <div className="card border-amber-200 bg-amber-50 p-4">
          <div className="font-semibold text-amber-900">Настройка не завершена</div>
          <ul className="mt-2 space-y-1 text-sm">
            {setup.map(([ok, t]) => <li key={t} className={ok ? 'text-emerald-700' : 'text-amber-800'}>{ok ? '✓' : '○'} {t}</li>)}
          </ul>
          <p className="mt-2 text-xs text-amber-700">Значения задаются в .env на сервере.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Закупочный баланс" value={<>{fmt(Math.round(totalBalance * 100) / 100)} <span className="text-sm font-medium text-slate-500">USDT</span></>}
          hint={Object.entries(data.balances).map(([k, v]) => `${k}: ${fmt(v)}`).join(' · ') || 'Появится после синхронизации'} onClick={() => go('sources')} />
        <Stat label="На витрине" value={onSale} hint={`из ${data.products.length} товаров, в наличии ${inStock.length}`} onClick={() => go('products')} />
        <Stat label="Оплаченных заказов" value={data.orders.length} hint={attention.length ? `${attention.length} требуют внимания` : 'Всё в порядке'} onClick={() => go('orders')} />
        <Stat label="Новые обращения" value={open} hint="Ждут ответа" onClick={() => go('support')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Автообновление каталога</h2>
              <p className="mt-1 text-sm text-slate-500">
                Последнее: {ago(last)}{last ? ` · следующее около ${date(last + data.sync_period)}` : ''}
              </p>
              <p className="text-sm text-slate-500">Наценка {fmt(data.markup_percent)}% · 1 USDT = {fmt(data.usdt_to_stars_rate)} ★ · каждые {Math.round(data.sync_period / 60)} мин</p>
            </div>
            <Button variant="primary" onClick={sync} disabled={busy}>{busy ? <Spinner /> : '↻'} Обновить сейчас</Button>
          </div>
          {data.catalog_error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Ошибка при обновлении: {data.catalog_error}</p>}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Требует внимания</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {attention.slice(0, 5).map(o => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <button onClick={() => go('orders')} className="truncate text-left hover:text-indigo-600">Заказ #{o.id.slice(0, 8)} · {o.error}</button>
                <Badge tone="bad">внимание</Badge>
              </li>
            ))}
            {data.pending_messages > 20 && <li>В очереди {data.pending_messages} сообщений: проверьте токены ботов.</li>}
            {!attention.length && data.pending_messages <= 20 && <li className="text-slate-500">Всё спокойно.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
