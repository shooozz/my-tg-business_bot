import { useEffect, useState } from 'react'
import { api, errText } from '../shared/api'
import { Button, Empty, Modal, Spinner, toast, useAction } from '../shared/ui'
import type { PageProps } from './common'
import { PageShell } from './App'

type Service = {
  id: number
  name: string
  slug: string
  description: string
  image: string
  emoji: string
  sort_order: number
  visible: number
  product_count?: number
}

function ServiceModal({ svc, onClose, onSaved }:
  { svc: Service | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !svc
  const [name, setName] = useState(svc?.name ?? '')
  const [slug, setSlug] = useState(svc?.slug ?? '')
  const [description, setDescription] = useState(svc?.description ?? '')
  const [emoji, setEmoji] = useState(svc?.emoji ?? '')
  const [sortOrder, setSortOrder] = useState(String(svc?.sort_order ?? 0))
  const [visible, setVisible] = useState(svc?.visible !== 0)
  const { busy, run } = useAction()

  async function submit() {
    if (!name.trim()) { toast('Введите название', true); return }
    const body = { name: name.trim(), slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description, emoji, sort_order: Number(sortOrder), visible: visible ? 1 : 0 }
    await run(async () => {
      if (isNew) await api('services', 'POST', body)
      else await api(`services/${svc!.id}`, 'PUT', body)
      onSaved(); onClose()
    }, isNew ? 'Сервис создан' : 'Сохранено')
  }

  return (
    <Modal title={isNew ? 'Новый сервис' : `Сервис: ${svc!.name}`} onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy && <Spinner />} Сохранить</Button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="label">Название *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="ChatGPT" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Slug (URL)</label>
            <input className="input" value={slug} onChange={e => setSlug(e.target.value)} placeholder="chatgpt (авто)" />
          </div>
          <div>
            <label className="label">Эмодзи</label>
            <input className="input" value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🤖" maxLength={8} />
          </div>
        </div>
        <div>
          <label className="label">Описание</label>
          <textarea className="input min-h-20" value={description} onChange={e => setDescription(e.target.value)} placeholder="Короткое описание сервиса для покупателей" maxLength={500} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Порядок сортировки</label>
            <input type="number" className="input" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 pt-5">
            <input type="checkbox" id="svc-visible" checked={visible} onChange={e => setVisible(e.target.checked)} />
            <label htmlFor="svc-visible" className="text-sm cursor-pointer" style={{ color: 'var(--c-text)' }}>Показывать на витрине</label>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function Services({ reload }: PageProps) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Service | null | 'new'>(null)

  async function loadServices() {
    try {
      const r = await api<{ services: Service[] }>('services')
      setServices(r.services)
    } catch (e) { toast(errText(e), true) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadServices() }, [])

  async function del(svc: Service) {
    if (!confirm(`Удалить сервис «${svc.name}»? Товары не удалятся.`)) return
    try { await api(`services/${svc.id}`, 'DELETE'); await loadServices() } catch (e) { toast(errText(e), true) }
  }

  return (
    <PageShell title="Сервисы"
      subtitle="Сервис — это бренд или продукт (ChatGPT, Spotify, Canva). Группирует связанные товары на одной странице."
      actions={<Button variant="primary" onClick={() => setEditing('new')}>+ Добавить сервис</Button>}>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-[var(--c-accent)]" /></div>
      ) : services.length === 0 ? (
        <Empty title="Сервисы не добавлены"
          text="Создайте сервис и привяжите к нему товары, чтобы покупатели видели все предложения в одном месте." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--c-bg3)' }}>
              <tr>
                <th className="th">Сервис</th>
                <th className="th">Slug</th>
                <th className="th">Товаров</th>
                <th className="th">Видимость</th>
                <th className="th">Порядок</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id} className="transition" style={{ borderTop: '1px solid var(--c-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{s.emoji || '📦'}</span>
                      <span className="font-medium" style={{ color: 'var(--c-text)' }}>{s.name}</span>
                    </div>
                    {s.description && <div className="mt-0.5 text-xs line-clamp-1" style={{ color: 'var(--c-muted)' }}>{s.description}</div>}
                  </td>
                  <td className="td">
                    <code className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--c-bg3)', color: 'var(--c-muted)' }}>{s.slug}</code>
                  </td>
                  <td className="td" style={{ color: 'var(--c-muted)' }}>{s.product_count ?? '—'}</td>
                  <td className="td">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium badge-${s.visible ? 'good' : 'muted'}`}>
                      {s.visible ? 'Виден' : 'Скрыт'}
                    </span>
                  </td>
                  <td className="td" style={{ color: 'var(--c-muted)' }}>{s.sort_order}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => setEditing(s)}>✎</Button>
                      <Button variant="danger" onClick={() => del(s)}>✕</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <ServiceModal
          svc={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { loadServices(); reload() }} />
      )}
    </PageShell>
  )
}
