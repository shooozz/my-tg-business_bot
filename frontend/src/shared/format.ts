export const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(n)

export const date = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export function ago(ts: number) {
  if (!ts) return 'никогда'
  const s = Math.max(0, Date.now() / 1000 - ts)
  if (s < 60) return 'только что'
  if (s < 3600) return `${Math.round(s / 60)} мин назад`
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`
  return date(ts)
}

/** Same formula as core.rebuild_prices: purchase USDT × (1 + markup) × rate. */
export const autoStars = (usdt: number, markup: number, rate: number) =>
  Math.max(1, Math.round(usdt * (1 + markup / 100) * rate))

const LABELS: Record<string, string> = {
  invoice: 'Ожидает оплаты', pending: 'Ожидает оплаты', paid: 'Оплачен', processing: 'В обработке',
  manual_review: 'Ручная выдача', partially_completed: 'Выдан частично', completed: 'Выдан',
  failed: 'Ошибка поставщика', cancelled: 'Отменён', refunded: 'Возврат у поставщика',
  attention: 'Требует внимания', refund_pending: 'Возвращаем Stars', customer_refunded: 'Stars возвращены',
  open: 'Новое', answered: 'Отвечено', closed: 'Закрыто',
}
export const statusLabel = (s: string) => LABELS[s] ?? s

export function statusTone(s: string): 'good' | 'bad' | 'warn' | 'muted' {
  if (['completed', 'answered', 'customer_refunded'].includes(s)) return 'good'
  if (['attention', 'failed'].includes(s)) return 'bad'
  if (['closed', 'cancelled'].includes(s)) return 'muted'
  return 'warn'
}
