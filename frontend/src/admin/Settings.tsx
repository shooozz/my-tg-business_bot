import { useState } from 'react'
import { api } from '../shared/api'
import { autoStars, date, fmt } from '../shared/format'
import { Badge, Button, Spinner, Toggle, toast, useAction } from '../shared/ui'
import type { PageProps } from './common'

const PERIODS: [number, string][] = [
  [300, '5 минут'], [600, '10 минут'], [900, '15 минут (рекомендуется)'], [1800, '30 минут'], [3600, '1 час'], [10800, '3 часа'],
]

export function Settings({ data, reload }: PageProps) {
  const [markup, setMarkup] = useState(String(data.markup_percent))
  const [rate, setRate] = useState(String(data.usdt_to_stars_rate))
  // Stored as USDT per 1 VND; people think in "VND per 1 USDT".
  const [vnd, setVnd] = useState(String(Math.round(1 / data.vnd_to_usdt_rate)))
  const [period, setPeriod] = useState(data.sync_period)
  const [publish, setPublish] = useState(data.auto_publish)
  const { busy, run } = useAction()
  const num = (s: string) => Number(s.replace(',', '.'))

  function save() {
    const m = num(markup), r = num(rate), v = num(vnd)
    if (!(m >= 0 && m <= 200)) return toast('Наценка от 0 до 200%', true)
    if (!(r > 0 && r <= 10000)) return toast('Курс Stars больше 0', true)
    if (!(v > 0)) return toast('Курс VND больше 0', true)
    run(async () => {
      await api('settings', 'PUT', { markup_percent: m, usdt_to_stars_rate: r, vnd_to_usdt_rate: 1 / v, sync_period: period, auto_publish: publish })
      await reload()
    }, 'Настройки сохранены, цены пересчитаны')
  }
  const options = PERIODS.some(([s]) => s === period) ? PERIODS : [...PERIODS, [period, `${Math.round(period / 60)} мин`] as [number, string]]

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Настройки</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card space-y-4 p-5" onSubmit={e => { e.preventDefault(); save() }}>
          <h2 className="font-semibold">Цены и обновление</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Наценка на все товары, %</span><input className="input" value={markup} onChange={e => setMarkup(e.target.value)} /></label>
            <label><span className="label">1 USDT = ? Stars</span><input className="input" value={rate} onChange={e => setRate(e.target.value)} /></label>
            <label><span className="label">1 USDT = ? VND (для Canboso)</span><input className="input" value={vnd} onChange={e => setVnd(e.target.value)} /></label>
            <label><span className="label">Автообновление каталога</span>
              <select className="input" value={period} onChange={e => setPeriod(Number(e.target.value))}>
                {options.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
              </select></label>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <span>Сразу выставлять на витрину новые товары поставщиков</span>
            <Toggle checked={publish} onChange={setPublish} label="Автопубликация" />
          </div>
          <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
            Пример: товар за 1 USDT будет стоить ≈ {fmt(autoStars(1, num(markup) || 0, num(rate) || 0))} ★. Своя наценка категории и цены, заданные вручную, сохраняются.
          </p>
          <p className="text-xs text-slate-500">
            Почему 15 минут: полное обновление делает несколько запросов (Jaha разрешает 120 в минуту, Canboso 30), поэтому нагрузка минимальна.
            Боты показывают товары из базы и к поставщику при просмотре не обращаются, поэтому скорость ботов от периода не зависит.
          </p>
          <Button variant="primary" disabled={busy}>{busy && <Spinner />}Сохранить</Button>
        </form>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">Подключения</h2>
          {([['shop', 'Бот магазина'], ['admin', 'Бот администратора'], ['support', 'Бот поддержки']] as const).map(([k, l]) => (
            <div key={k} className="flex justify-between text-sm"><span>{l}</span><Badge tone={data.configured[k] ? 'good' : 'warn'}>{data.configured[k] ? 'токен задан' : 'не настроен'}</Badge></div>
          ))}
          <div className="flex justify-between text-sm"><span>Сообщений в очереди</span><span>{data.pending_messages}</span></div>
          <p className="text-xs text-slate-500">Токены и ключи меняются только в .env на сервере.</p>
          <h2 className="pt-2 font-semibold">Журнал действий</h2>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {data.audit.map(a => <li key={a.id} className="flex justify-between gap-2"><span className="truncate">{a.action}</span><span className="shrink-0 text-slate-400">{a.actor} · {date(a.created)}</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}
