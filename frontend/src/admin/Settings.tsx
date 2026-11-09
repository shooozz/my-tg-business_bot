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
  const [rub, setRub] = useState(String(data.rub_rate))
  const [rubLocked, setRubLocked] = useState(data.rub_rate_locked ?? false)
  const [period, setPeriod] = useState(data.sync_period)
  const [publish, setPublish] = useState(data.auto_publish)
  const [payStars, setPayStars] = useState(data.pay_stars_enabled ?? true)
  const [payCrypto, setPayCrypto] = useState(data.pay_crypto_enabled ?? false)
  const [cryptoToken, setCryptoToken] = useState(data.pay_crypto_token ?? '')
  const [payRub, setPayRub] = useState(data.pay_rub_enabled ?? false)
  const [rubProvider, setRubProvider] = useState(data.pay_rub_provider ?? 'okassa')
  const [rubApiKey, setRubApiKey] = useState(data.pay_rub_api_key ?? '')
  const { busy, run } = useAction()
  const num = (s: string) => Number(s.replace(',', '.'))

  function save() {
    const m = num(markup), r = num(rate), v = num(vnd), rubRate = num(rub)
    if (!(m >= 0 && m <= 200)) return toast('Наценка от 0 до 200%', true)
    if (!(r > 0 && r <= 10000)) return toast('Курс Stars больше 0', true)
    if (!(v > 0)) return toast('Курс VND больше 0', true)
    if (!(rubRate > 0 && rubRate <= 100000)) return toast('Курс RUB больше 0', true)
    run(async () => {
      await api('settings', 'PUT', {
        markup_percent: m,
        usdt_to_stars_rate: r,
        vnd_to_usdt_rate: 1 / v,
        rub_rate: rubRate,
        rub_rate_locked: rubLocked,
        sync_period: period,
        auto_publish: publish,
        pay_stars_enabled: payStars,
        pay_crypto_enabled: payCrypto,
        pay_crypto_token: cryptoToken,
        pay_rub_enabled: payRub,
        pay_rub_provider: rubProvider,
        pay_rub_api_key: rubApiKey,
      })
      await reload()
    }, 'Настройки сохранены, цены пересчитаны')
  }
  const options = PERIODS.some(([s]) => s === period) ? PERIODS : [...PERIODS, [period, `${Math.round(period / 60)} мин`] as [number, string]]

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Настройки</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card space-y-4 p-5" onSubmit={e => { e.preventDefault(); save() }}>
          <h2 className="font-semibold" style={{ color: 'var(--c-text)' }}>Цены и обновление</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Наценка на все товары, %</span><input className="input" value={markup} onChange={e => setMarkup(e.target.value)} /></label>
            <label><span className="label">1 USDT = ? Stars</span><input className="input" value={rate} onChange={e => setRate(e.target.value)} /></label>
            <label><span className="label">1 USDT = ? VND (для Canboso)</span><input className="input" value={vnd} onChange={e => setVnd(e.target.value)} /></label>
            <label>
              <span className="label flex items-center justify-between">
                <span>1 USDT = ? RUB (для витрины)</span>
                {rubLocked && <span className="text-xs" style={{ color: 'var(--c-warn)' }}>🔒 Зафиксирован</span>}
              </span>
              <input className="input" value={rub} onChange={e => setRub(e.target.value)} disabled={rubLocked} />
            </label>
            <label><span className="label">Автообновление каталога</span>
              <select className="input" value={period} onChange={e => setPeriod(Number(e.target.value))}>
                {options.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
              </select></label>
          </div>
          {!rubLocked && (
            <p className="rounded-xl p-3 text-xs" style={{ background: 'color-mix(in srgb, var(--c-warn) 10%, var(--c-bg2))', color: 'var(--c-warn)' }}>
              Курс RUB обновляется автоматически при изменении USDT→Stars. Чтобы зафиксировать курс, поставьте галочку ниже.
            </p>
          )}
          <div className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: 'var(--c-bg3)' }}>
            <span style={{ color: 'var(--c-text)' }}>Зафиксировать курс RUB (не пересчитывать автоматически)</span>
            <Toggle checked={rubLocked} onChange={setRubLocked} label="Блокировка курса RUB" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: 'var(--c-bg3)' }}>
            <span style={{ color: 'var(--c-text)' }}>Сразу выставлять на витрину новые товары поставщиков</span>
            <Toggle checked={publish} onChange={setPublish} label="Автопубликация" />
          </div>
          <p className="rounded-xl p-3 text-sm" style={{ background: 'color-mix(in srgb, var(--c-accent) 10%, var(--c-bg2))', color: 'var(--c-accent)' }}>
            Пример: товар за 1 USDT будет стоить ≈ {fmt(autoStars(1, num(markup) || 0, num(rate) || 0))} ★ и {Math.round((num(rub) || 0) * (1 + (num(markup) || 0) / 100))} ₽.
          </p>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            Почему 15 минут: полное обновление делает несколько запросов (Jaha разрешает 120 в минуту, Canboso 30), поэтому нагрузка минимальна.
            Боты показывают товары из базы и к поставщику при просмотре не обращаются, поэтому скорость ботов от периода не зависит.
          </p>
          <Button variant="primary" disabled={busy}>{busy && <Spinner />}Сохранить</Button>
        </form>

        <form className="card space-y-4 p-5" onSubmit={e => { e.preventDefault(); save() }}>
          <h2 className="font-semibold" style={{ color: 'var(--c-text)' }}>Методы оплаты</h2>
          <div className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: 'var(--c-bg3)' }}>
            <span style={{ color: 'var(--c-text)' }}>Telegram Stars (через бот магазина)</span>
            <Toggle checked={payStars} onChange={setPayStars} label="Stars" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: 'var(--c-bg3)' }}>
              <span style={{ color: 'var(--c-text)' }}>Крипта (CryptoBot)</span>
              <Toggle checked={payCrypto} onChange={setPayCrypto} label="Крипта" />
            </div>
            {payCrypto && (
              <label><span className="label">Токен CryptoBot API</span>
                <input className="input" type="password" placeholder="12345:..." value={cryptoToken} onChange={e => setCryptoToken(e.target.value)} />
              </label>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: 'var(--c-bg3)' }}>
              <span style={{ color: 'var(--c-text)' }}>Рубли (ЮKassa / Robokassa)</span>
              <Toggle checked={payRub} onChange={setPayRub} label="Рубли" />
            </div>
            {payRub && (
              <>
                <label><span className="label">Провайдер</span>
                  <select className="input" value={rubProvider} onChange={e => setRubProvider(e.target.value)}>
                    <option value="okassa">ЮKassa</option>
                    <option value="robokassa">Robokassa</option>
                  </select>
                </label>
                <label><span className="label">API ключ / Shop ID</span>
                  <input className="input" type="password" value={rubApiKey} onChange={e => setRubApiKey(e.target.value)} />
                </label>
              </>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            Включённые методы будут доступны покупателям на витрине и в боте. Токены и ключи хранятся в зашифрованном виде.
          </p>
          <Button variant="primary" disabled={busy}>{busy && <Spinner />}Сохранить</Button>
        </form>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold" style={{ color: 'var(--c-text)' }}>Подключения</h2>
          {([['shop', 'Бот магазина'], ['admin', 'Бот администратора'], ['support', 'Бот поддержки']] as const).map(([k, l]) => (
            <div key={k} className="flex justify-between text-sm">
              <span style={{ color: 'var(--c-text)' }}>{l}</span>
              <Badge tone={data.configured[k] ? 'good' : 'warn'}>{data.configured[k] ? 'токен задан' : 'не настроен'}</Badge>
            </div>
          ))}
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--c-text)' }}>Сообщений в очереди</span>
            <span style={{ color: 'var(--c-muted)' }}>{data.pending_messages}</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Токены и ключи меняются только в .env на сервере.</p>
          <h2 className="pt-2 font-semibold" style={{ color: 'var(--c-text)' }}>Журнал действий</h2>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {data.audit.map(a => (
              <li key={a.id} className="flex justify-between gap-2">
                <span className="truncate" style={{ color: 'var(--c-text)' }}>{a.action}</span>
                <span className="shrink-0" style={{ color: 'var(--c-muted)' }}>{a.actor} · {date(a.created)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
