import { useState } from 'react'
import { api } from '../shared/api'
import { date, statusLabel, statusTone } from '../shared/format'
import { Badge, Button, Empty, useAction } from '../shared/ui'
import type { PageProps } from './common'

export function Support({ data, reload }: PageProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [text, setText] = useState('')
  const { busy, run } = useAction()
  const t = data.tickets.find(x => x.id === selected) ?? data.tickets[0]

  const reply = () => run(async () => {
    await api(`tickets/${t.id}/reply`, 'POST', { text }); setText(''); await reload()
  }, 'Ответ отправлен от имени бота поддержки')
  const close = () => run(async () => { await api(`tickets/${t.id}/close`, 'POST'); await reload() }, 'Обращение закрыто')

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Поддержка</h1><p className="text-sm text-slate-500">Покупатели пишут боту поддержки, ответ уходит от его имени. Фото и файлы видны в Telegram.</p></div>
      {data.tickets.length === 0 ? <div className="card"><Empty title="Пока тихо" text="Новые обращения появятся здесь." /></div> : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="card max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
            {data.tickets.map(x => (
              <button key={x.id} onClick={() => setSelected(x.id)} className={`block w-full px-4 py-3 text-left ${x.id === t.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-2"><span className="font-medium">#{x.id}</span><Badge tone={statusTone(x.state)}>{statusLabel(x.state)}</Badge></div>
                <div className="mt-1 truncate text-xs text-slate-500">{x.messages.at(-1)?.text ?? ''}</div>
                <div className="text-xs text-slate-400">{date(x.created)} · TG {x.user_id}</div>
              </button>
            ))}
          </div>
          <div className="card flex flex-col p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Обращение #{t.id}</h2>
              {t.state !== 'closed' && <Button disabled={busy} onClick={close}>Закрыть</Button>}</div>
            <div className="my-4 flex max-h-[50vh] flex-1 flex-col gap-2 overflow-y-auto">
              {t.messages.map(m => (
                <div key={m.id} className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.author === 'support' ? 'self-end bg-indigo-600 text-white' : 'self-start bg-slate-100'}`}>
                  <div className={`text-xs ${m.author === 'support' ? 'text-indigo-200' : 'text-slate-500'}`}>{m.author === 'support' ? 'Поддержка' : 'Покупатель'} · {date(m.created)}</div>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              ))}
            </div>
            <form onSubmit={e => { e.preventDefault(); if (text.trim()) reply() }} className="flex gap-2">
              <textarea className="input min-h-12" value={text} maxLength={3500} placeholder="Ответ покупателю…" onChange={e => setText(e.target.value)} aria-label="Ответ" />
              <Button variant="primary" disabled={busy || !text.trim()}>Отправить</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
