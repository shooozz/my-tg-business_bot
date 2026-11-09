import { useState } from 'react'
import { api } from '../shared/api'
import { date, statusLabel, statusTone } from '../shared/format'
import { Badge, Button, Empty, useAction } from '../shared/ui'
import type { PageProps } from './common'
import { PageShell } from './App'

export function Support({ data, reload }: PageProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [text, setText] = useState('')
  const { busy, run } = useAction()
  const t = data.tickets.find(x => x.id === selected) ?? data.tickets[0]

  const reply = () => run(async () => {
    await api(`tickets/${t.id}/reply`, 'POST', { text }); setText(''); await reload()
  }, 'Ответ отправлен от имени бота поддержки')
  const close = () => run(async () => {
    await api(`tickets/${t.id}/close`, 'POST'); await reload()
  }, 'Обращение закрыто')

  return (
    <PageShell title="Поддержка"
      subtitle="Покупатели пишут боту поддержки, ответ уходит от его имени. Фото и файлы видны в Telegram.">

      {data.tickets.length === 0 ? (
        <div className="card"><Empty title="Пока тихо" text="Новые обращения появятся здесь." /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          {/* Ticket list */}
          <div className="card max-h-[70vh] divide-y overflow-y-auto"
            style={{ borderColor: 'var(--c-border)' }}>
            {data.tickets.map(x => (
              <button key={x.id} onClick={() => setSelected(x.id)}
                className="block w-full px-4 py-3 text-left transition"
                style={x.id === t?.id
                  ? { background: 'color-mix(in srgb, var(--c-accent) 10%, var(--c-bg2))' }
                  : { background: 'var(--c-bg2)' }}
                onMouseEnter={e => { if (x.id !== t?.id) e.currentTarget.style.background = 'var(--c-bg3)' }}
                onMouseLeave={e => { if (x.id !== t?.id) e.currentTarget.style.background = 'var(--c-bg2)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" style={{ color: 'var(--c-text)' }}>#{x.id}</span>
                  <Badge tone={statusTone(x.state)}>{statusLabel(x.state)}</Badge>
                </div>
                <div className="mt-1 truncate text-xs" style={{ color: 'var(--c-muted)' }}>{x.messages.at(-1)?.text ?? ''}</div>
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>{date(x.created)} · TG {x.user_id}</div>
              </button>
            ))}
          </div>

          {/* Conversation */}
          {t && (
            <div className="card flex flex-col p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold" style={{ color: 'var(--c-text)' }}>Обращение #{t.id}</h2>
                {t.state !== 'closed' && <Button disabled={busy} onClick={close}>Закрыть</Button>}
              </div>

              <div className="my-2 flex max-h-[50vh] flex-1 flex-col gap-2 overflow-y-auto">
                {t.messages.map(m => {
                  const isSupport = m.author === 'support'
                  return (
                    <div key={m.id}
                      className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isSupport ? 'self-end' : 'self-start'}`}
                      style={isSupport
                        ? { background: 'var(--c-accent)', color: '#fff' }
                        : { background: 'var(--c-bg3)', color: 'var(--c-text)' }}>
                      <div className="mb-1 text-xs opacity-70">
                        {isSupport ? 'Поддержка' : 'Покупатель'} · {date(m.created)}
                      </div>
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    </div>
                  )
                })}
              </div>

              <form onSubmit={e => { e.preventDefault(); if (text.trim()) reply() }}
                className="flex gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
                <textarea className="input min-h-12" value={text} maxLength={3500}
                  placeholder="Ответ покупателю…"
                  onChange={e => setText(e.target.value)} aria-label="Ответ" />
                <Button variant="primary" disabled={busy || !text.trim()}>Отправить</Button>
              </form>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
