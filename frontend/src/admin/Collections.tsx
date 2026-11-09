import { useEffect, useState } from 'react'
import { api, errText } from '../shared/api'
import { Button, Empty, Modal, Spinner, toast, useAction } from '../shared/ui'
import type { PageProps } from './common'
import { PageShell } from './App'

type Collection = {
  id: number
  name: string
  slug: string
  description: string
  collection_type: 'manual' | 'auto'
  sort_order: number
  visible: number
  visible_store: number
  visible_bot: number
  limit_count: number
  product_count?: number
}

const TYPE_LABELS: Record<string, string> = {
  manual: 'Ручная',
  auto: 'Автоматическая',
}

function CollectionModal({ coll, onClose, onSaved }:
  { coll: Collection | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !coll
  const [name, setName] = useState(coll?.name ?? '')
  const [slug, setSlug] = useState(coll?.slug ?? '')
  const [description, setDescription] = useState(coll?.description ?? '')
  const [type, setType] = useState<'manual' | 'auto'>(coll?.collection_type ?? 'manual')
  const [sortOrder, setSortOrder] = useState(String(coll?.sort_order ?? 0))
  const [visible, setVisible] = useState(coll?.visible !== 0)
  const [visibleStore, setVisibleStore] = useState(coll?.visible_store !== 0)
  const [visibleBot, setVisibleBot] = useState(coll?.visible_bot !== 0)
  const [limit, setLimit] = useState(String(coll?.limit_count ?? 0))
  const { busy, run } = useAction()

  async function submit() {
    if (!name.trim()) { toast('Введите название', true); return }
    const body = {
      name: name.trim(),
      slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description,
      collection_type: type,
      sort_order: Number(sortOrder),
      visible: visible ? 1 : 0,
      visible_store: visibleStore ? 1 : 0,
      visible_bot: visibleBot ? 1 : 0,
      limit_count: Number(limit),
    }
    await run(async () => {
      if (isNew) await api('collections', 'POST', body)
      else await api(`collections/${coll!.id}`, 'PUT', body)
      onSaved(); onClose()
    }, isNew ? 'Подборка создана' : 'Сохранено')
  }

  return (
    <Modal title={isNew ? 'Новая подборка' : `Подборка: ${coll!.name}`} onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy && <Spinner />} Сохранить</Button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="label">Название *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Популярное" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Slug (URL)</label>
            <input className="input" value={slug} onChange={e => setSlug(e.target.value)} placeholder="popular (авто)" />
          </div>
          <div>
            <label className="label">Тип</label>
            <select className="input" value={type} onChange={e => setType(e.target.value as 'manual' | 'auto')}>
              <option value="manual">Ручная — добавляю товары сам</option>
              <option value="auto">Автоматическая — по правилам</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Описание</label>
          <textarea className="input min-h-16" value={description} onChange={e => setDescription(e.target.value)} placeholder="Краткое описание подборки" maxLength={300} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Максимум товаров (0 = без ограничения)</label>
            <input type="number" min={0} className="input" value={limit} onChange={e => setLimit(e.target.value)} />
          </div>
          <div>
            <label className="label">Порядок сортировки</label>
            <input type="number" className="input" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
          </div>
        </div>
        <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--c-bg3)' }}>
          <div className="text-xs font-semibold uppercase" style={{ color: 'var(--c-muted)' }}>Видимость</div>
          {[
            ['visible', visible, setVisible, 'Вообще активна'],
            ['visible_store', visibleStore, setVisibleStore, 'Показывать на сайте'],
            ['visible_bot', visibleBot, setVisibleBot, 'Показывать в боте'],
          ].map(([, val, setter, lbl]) => (
            <label key={lbl as string} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--c-text)' }}>
              <input type="checkbox" checked={val as boolean} onChange={e => (setter as (v: boolean) => void)(e.target.checked)} />
              {lbl as string}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export function Collections({ reload }: PageProps) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Collection | null | 'new'>(null)

  async function loadCollections() {
    try {
      const r = await api<{ collections: Collection[] }>('collections')
      setCollections(r.collections)
    } catch (e) { toast(errText(e), true) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadCollections() }, [])

  async function del(c: Collection) {
    if (!confirm(`Удалить подборку «${c.name}»?`)) return
    try { await api(`collections/${c.id}`, 'DELETE'); await loadCollections() } catch (e) { toast(errText(e), true) }
  }

  return (
    <PageShell title="Подборки"
      subtitle="Подборки — это витрины по редакционным или автоматическим правилам: Популярное, Новинки, Выбор BYBLOCK."
      actions={<Button variant="primary" onClick={() => setEditing('new')}>+ Добавить подборку</Button>}>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-[var(--c-accent)]" /></div>
      ) : collections.length === 0 ? (
        <Empty title="Подборок пока нет"
          text="Создайте первую подборку и добавьте в неё товары — они появятся на главной странице магазина." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--c-bg3)' }}>
              <tr>
                <th className="th">Подборка</th>
                <th className="th">Тип</th>
                <th className="th">Товаров</th>
                <th className="th">Каналы</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {collections.map(c => (
                <tr key={c.id} className="transition" style={{ borderTop: '1px solid var(--c-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td className="td">
                    <span className="font-medium" style={{ color: 'var(--c-text)' }}>{c.name}</span>
                    {c.description && <div className="mt-0.5 text-xs line-clamp-1" style={{ color: 'var(--c-muted)' }}>{c.description}</div>}
                    <code className="mt-1 block rounded px-1.5 py-0.5 text-xs w-fit" style={{ background: 'var(--c-bg3)', color: 'var(--c-muted)' }}>{c.slug}</code>
                  </td>
                  <td className="td">
                    <span className={`badge-${c.collection_type === 'auto' ? 'info' : 'muted'} rounded-full px-2 py-0.5 text-xs`}>
                      {TYPE_LABELS[c.collection_type]}
                    </span>
                  </td>
                  <td className="td" style={{ color: 'var(--c-muted)' }}>
                    {c.product_count ?? '—'}{c.limit_count ? ` / ${c.limit_count}` : ''}
                  </td>
                  <td className="td">
                    <div className="flex gap-1 text-xs">
                      {c.visible_store ? <span className="badge-good rounded-full px-2 py-0.5">Сайт</span> : <span className="badge-muted rounded-full px-2 py-0.5">Сайт</span>}
                      {c.visible_bot ? <span className="badge-good rounded-full px-2 py-0.5">Бот</span> : <span className="badge-muted rounded-full px-2 py-0.5">Бот</span>}
                    </div>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => setEditing(c)}>✎</Button>
                      <Button variant="danger" onClick={() => del(c)}>✕</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <CollectionModal
          coll={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { loadCollections(); reload() }} />
      )}
    </PageShell>
  )
}
