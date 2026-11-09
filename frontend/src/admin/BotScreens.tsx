import { useEffect, useState } from 'react'
import { api, errText } from '../shared/api'
import { Button, Empty, Modal, Spinner, toast, useAction } from '../shared/ui'
import type { PageProps } from './common'
import { PageShell } from './App'

type BotScreen = {
  id: number
  screen_key: string
  name: string
  draft_data: string
  published_data: string
  published_at: number | null
  sort_order: number
  updated: number
}

type ScreenData = {
  text: string
  image?: string
  buttons?: { label: string; action: string }[][]
  layout?: 1 | 2 | 3
}

const SCREEN_NAMES: Record<string, string> = {
  welcome:      'Приветствие',
  main_menu:    'Главное меню',
  catalog:      'Каталог (категории)',
  product_list: 'Список товаров',
  product_card: 'Карточка товара',
  promo_input:  'Ввод промокода',
  checkout:     'Подтверждение заказа',
  waiting:      'Ожидание выдачи',
  delivery:     'Выдача товара',
  orders:       'История заказов',
  guarantee:    'Гарантия',
  support:      'Помощь',
  docs:         'Документы',
}

const ACTION_OPTIONS = [
  { value: '', label: '— не задано —' },
  { value: 'open_catalog', label: 'Открыть каталог' },
  { value: 'open_support', label: 'Открыть поддержку' },
  { value: 'open_orders', label: 'История заказов' },
  { value: 'open_guarantee', label: 'Гарантия' },
  { value: 'open_docs', label: 'Документы' },
  { value: 'start_over', label: 'Вернуться в начало' },
]

const VARIABLES = [
  '{{first_name}}',
  '{{order_count}}',
  '{{shop_name}}',
  '{{product_name}}',
  '{{price}}',
]

function ScreenEditor({ screen, onClose, onSaved }:
  { screen: BotScreen; onClose: () => void; onSaved: () => void }) {
  const parseDraft = (): ScreenData => {
    try { return JSON.parse(screen.draft_data) } catch { return { text: '', buttons: [], layout: 1 } }
  }
  const [data, setData] = useState<ScreenData>(parseDraft)
  const [showVars, setShowVars] = useState(false)
  const { busy, run } = useAction()

  function insertVar(v: string) {
    setData(d => ({ ...d, text: d.text + v }))
  }

  function addButton() {
    setData(d => ({ ...d, buttons: [...(d.buttons ?? []), [{ label: 'Кнопка', action: '' }]] }))
  }

  function updateButton(row: number, col: number, key: 'label' | 'action', val: string) {
    setData(d => {
      const btns = (d.buttons ?? []).map(r => [...r])
      if (!btns[row]) return d
      btns[row][col] = { ...btns[row][col], [key]: val }
      return { ...d, buttons: btns }
    })
  }

  function removeButtonRow(row: number) {
    setData(d => ({ ...d, buttons: (d.buttons ?? []).filter((_, i) => i !== row) }))
  }

  async function saveDraft() {
    await run(async () => {
      await api(`bot-screens/${screen.id}/draft`, 'PUT', { draft_data: JSON.stringify(data) })
      onSaved()
    }, 'Черновик сохранён')
  }

  async function publish() {
    await run(async () => {
      await api(`bot-screens/${screen.id}/draft`, 'PUT', { draft_data: JSON.stringify(data) })
      await api(`bot-screens/${screen.id}/publish`, 'POST')
      onSaved(); onClose()
    }, 'Опубликовано')
  }

  const hasChanges = JSON.stringify(data) !== screen.draft_data

  return (
    <Modal title={`Редактор: ${SCREEN_NAMES[screen.screen_key] ?? screen.name}`}
      onClose={onClose} wide
      footer={<>
        <Button onClick={onClose}>Закрыть</Button>
        <Button onClick={saveDraft} disabled={busy || !hasChanges}>{busy && <Spinner />} Сохранить черновик</Button>
        <Button variant="primary" onClick={publish} disabled={busy}>{busy && <Spinner />} Опубликовать</Button>
      </>}>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* Editor */}
        <div className="space-y-4">
          {/* Text */}
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Текст сообщения</label>
              <button className="text-xs transition hover:opacity-80" style={{ color: 'var(--c-accent)' }}
                onClick={() => setShowVars(v => !v)}>
                {showVars ? 'Скрыть' : '+ Переменная'}
              </button>
            </div>
            {showVars && (
              <div className="mb-2 flex flex-wrap gap-1">
                {VARIABLES.map(v => (
                  <button key={v} onClick={() => insertVar(v)}
                    className="rounded px-2 py-0.5 text-xs transition hover:opacity-80"
                    style={{ background: 'var(--c-bg3)', color: 'var(--c-accent)' }}>
                    {v}
                  </button>
                ))}
              </div>
            )}
            <textarea className="input min-h-32 font-mono text-sm"
              value={data.text}
              onChange={e => setData(d => ({ ...d, text: e.target.value }))}
              placeholder="Текст сообщения. Поддерживается <b>жирный</b> и <i>курсив</i>."
              maxLength={4096} />
            <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
              Форматирование: {`<b>жирный</b>, <i>курсив</i>, <code>код</code>`}
            </p>
          </div>

          {/* Image URL */}
          <div>
            <label className="label">Изображение (URL)</label>
            <input className="input" value={data.image ?? ''}
              onChange={e => setData(d => ({ ...d, image: e.target.value }))}
              placeholder="https://... (опционально)" />
          </div>

          {/* Layout */}
          <div>
            <label className="label">Раскладка кнопок</label>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map(n => (
                <button key={n} onClick={() => setData(d => ({ ...d, layout: n }))}
                  className="flex-1 rounded-lg py-2 text-sm font-medium transition"
                  style={data.layout === n
                    ? { background: 'var(--c-accent)', color: '#fff' }
                    : { background: 'var(--c-bg3)', color: 'var(--c-muted)' }}>
                  {n} кол.
                </button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Кнопки</label>
              <Button variant="ghost" onClick={addButton}>+ Добавить строку</Button>
            </div>
            <div className="space-y-2">
              {(data.buttons ?? []).map((row, ri) => (
                <div key={ri} className="rounded-xl p-3" style={{ background: 'var(--c-bg3)' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>Строка {ri + 1}</span>
                    <button onClick={() => removeButtonRow(ri)} className="text-xs transition hover:opacity-80" style={{ color: 'var(--c-bad)' }}>✕ Удалить строку</button>
                  </div>
                  {row.map((btn, ci) => (
                    <div key={ci} className="grid grid-cols-[1fr_1fr] gap-2 mb-2">
                      <input className="input py-1.5 text-sm" value={btn.label}
                        onChange={e => updateButton(ri, ci, 'label', e.target.value)}
                        placeholder="Текст кнопки" />
                      <select className="input py-1.5 text-sm" value={btn.action}
                        onChange={e => updateButton(ri, ci, 'action', e.target.value)}>
                        {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <div className="label mb-2">Предпросмотр</div>
          <div className="rounded-2xl p-4 space-y-3"
            style={{ background: '#17212b', minHeight: 200 }}>
            {data.image && (
              <div className="rounded-lg overflow-hidden bg-gray-700 h-32 flex items-center justify-center text-gray-500 text-xs">
                {data.image ? '🖼 Изображение' : ''}
              </div>
            )}
            <div className="rounded-lg px-3 py-2 text-sm text-white max-w-[240px]"
              style={{ background: '#2b5278' }}>
              <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                __html: (data.text || '<em style="opacity:.5">Текст не задан</em>')
                  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/&lt;b&gt;(.+?)&lt;\/b&gt;/g, '<strong>$1</strong>')
                  .replace(/&lt;i&gt;(.+?)&lt;\/i&gt;/g, '<em>$1</em>')
                  .replace(/&lt;code&gt;(.+?)&lt;\/code&gt;/g, '<code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px">$1</code>')
              }} />
            </div>
            {(data.buttons ?? []).map((row, ri) => (
              <div key={ri} className={`grid gap-1 ${data.layout === 2 ? 'grid-cols-2' : data.layout === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                {row.map((btn, ci) => (
                  <button key={ci} className="rounded-lg px-3 py-1.5 text-xs text-white text-center"
                    style={{ background: 'rgba(255,255,255,.12)' }}>
                    {btn.label || '…'}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {screen.published_at && (
            <p className="mt-2 text-xs" style={{ color: 'var(--c-muted)' }}>
              Опубликовано: {new Date(screen.published_at * 1000).toLocaleDateString('ru-RU')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function BotScreens({ reload: _reload }: PageProps) {
  const [screens, setScreens] = useState<BotScreen[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BotScreen | null>(null)

  async function loadScreens() {
    try {
      const r = await api<{ screens: BotScreen[] }>('bot-screens')
      setScreens(r.screens)
    } catch (e) { toast(errText(e), true) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadScreens() }, [])

  return (
    <PageShell title="Клиентский бот"
      subtitle="Настройте тексты и кнопки всех экранов бота без правок кода. Изменения применяются после публикации.">

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-[var(--c-accent)]" /></div>
      ) : screens.length === 0 ? (
        <Empty title="Экраны не найдены" text="Перезапустите сервер — экраны должны создаться автоматически." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map(s => {
            const hasDraft = s.draft_data && s.draft_data !== '{}'
            const hasPublished = s.published_data && s.published_data !== '{}'
            const isDirty = hasDraft && s.draft_data !== s.published_data
            return (
              <button key={s.id} onClick={() => setEditing(s)}
                className="card flex flex-col gap-3 p-4 text-left transition hover:shadow-md"
                style={{ borderColor: isDirty ? 'var(--c-accent)' : 'var(--c-border)' }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
                    {SCREEN_NAMES[s.screen_key] ?? s.name}
                  </span>
                  <div className="flex gap-1">
                    {isDirty && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium badge-warn">черновик</span>
                    )}
                    {hasPublished && !isDirty && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium badge-good">опубликован</span>
                    )}
                    {!hasDraft && !hasPublished && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium badge-muted">не задан</span>
                    )}
                  </div>
                </div>
                <code className="rounded px-1.5 py-0.5 text-xs self-start"
                  style={{ background: 'var(--c-bg3)', color: 'var(--c-muted)' }}>
                  {s.screen_key}
                </code>
                {s.published_at && (
                  <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    Обновлён: {new Date(s.published_at * 1000).toLocaleDateString('ru-RU')}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}

      {editing && (
        <ScreenEditor
          screen={editing}
          onClose={() => setEditing(null)}
          onSaved={loadScreens} />
      )}
    </PageShell>
  )
}
