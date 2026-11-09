import { api } from '../shared/api'
import { ago, date, fmt } from '../shared/format'
import { Badge, Button, Spinner, useAction } from '../shared/ui'
import type { PageProps } from './common'
import { PageShell, StatTile } from './App'

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
    [data.configured.shop, 'Токен бота магазина'],
    [data.configured.admin, 'Токен бота администратора'],
    [data.configured.support, 'Токен бота поддержки'],
  ]
  const allSetup = setup.every(([ok]) => ok)

  return (
    <PageShell
      title="Обзор"
      subtitle={new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}>

      {/* Setup warning */}
      {!allSetup && (
        <div className="rounded-2xl border p-5"
          style={{ background: 'color-mix(in srgb, var(--c-warn) 8%, var(--c-bg2))', borderColor: 'color-mix(in srgb, var(--c-warn) 35%, transparent)' }}>
          <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--c-warn)' }}>
            ⚠ Настройка не завершена
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {setup.map(([ok, t]) => (
              <li key={t} className="flex items-center gap-2">
                <span style={{ color: ok ? 'var(--c-good)' : 'var(--c-warn)' }}>{ok ? '✓' : '○'}</span>
                <span style={{ color: ok ? 'var(--c-muted)' : 'var(--c-text)' }}>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs" style={{ color: 'var(--c-muted)' }}>Значения задаются в .env на сервере.</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Закупочный баланс"
          value={<>{fmt(Math.round(totalBalance * 100) / 100)} <span className="text-sm font-medium" style={{ color: 'var(--c-muted)' }}>USDT</span></>}
          hint={Object.entries(data.balances).map(([k, v]) => `${k}: ${fmt(v)}`).join(' · ') || 'Появится после синхронизации'}
          onClick={() => go('sources')} />
        <StatTile label="На витрине" value={onSale}
          hint={`из ${data.products.length} товаров, в наличии ${inStock.length}`}
          onClick={() => go('products')} />
        <StatTile label="Оплаченных заказов" value={data.orders.length}
          hint={attention.length ? `${attention.length} требуют внимания` : 'Всё в порядке'}
          tone={attention.length ? 'bad' : 'default'}
          onClick={() => go('orders')} />
        <StatTile label="Новые обращения" value={open}
          hint="Ждут ответа" tone={open > 0 ? 'warn' : 'default'}
          onClick={() => go('support')} />
      </div>

      {/* Two cards row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sync card */}
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--c-text)' }}>Автообновление каталога</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--c-muted)' }}>
                Последнее: {ago(last)}{last ? ` · следующее около ${date(last + data.sync_period)}` : ''}
              </p>
              <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
                Наценка {fmt(data.markup_percent)}% · 1 USDT = {fmt(data.usdt_to_stars_rate)} ★ · каждые {Math.round(data.sync_period / 60)} мин
              </p>
            </div>
            <Button variant="primary" onClick={sync} disabled={busy}>
              {busy ? <Spinner /> : '↻'} Обновить
            </Button>
          </div>
          {data.catalog_error && (
            <p className="mt-3 rounded-xl px-4 py-3 text-sm"
              style={{ background: 'color-mix(in srgb, var(--c-bad) 10%, var(--c-bg3))', color: 'var(--c-bad)' }}>
              Ошибка: {data.catalog_error}
            </p>
          )}
        </div>

        {/* Attention card */}
        <div className="card p-5">
          <h2 className="font-semibold" style={{ color: 'var(--c-text)' }}>Требует внимания</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {attention.slice(0, 5).map(o => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <button onClick={() => go('orders')}
                  className="truncate text-left transition hover:opacity-80"
                  style={{ color: 'var(--c-text)' }}>
                  Заказ #{o.id.slice(0, 8)} · {o.error}
                </button>
                <Badge tone="bad">внимание</Badge>
              </li>
            ))}
            {data.pending_messages > 20 && (
              <li style={{ color: 'var(--c-warn)' }}>
                В очереди {data.pending_messages} сообщений — проверьте токены ботов.
              </li>
            )}
            {!attention.length && data.pending_messages <= 20 && (
              <li style={{ color: 'var(--c-muted)' }}>Всё спокойно.</li>
            )}
          </ul>
        </div>
      </div>
    </PageShell>
  )
}
