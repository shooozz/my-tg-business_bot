/**
 * Home page — 10 blocks as per spec:
 * 1. Hero banner
 * 2. Popular services (tiles)
 * 3. BYBLOCK picks (featured collection)
 * 4. Popular products (by orders)
 * 5. New arrivals
 * 6. Auto-delivery
 * 7. Category tiles (by task)
 * 8. How it works
 * 9. Footer / support
 *
 * Search & filter mode is handled separately in App.tsx (CatalogView).
 */

import { type ReactNode } from 'react'
import type { PublicCategory, PublicProduct } from '../shared/types'
import { Spinner } from '../shared/ui'
import { ProductCard } from './ProductCard'

// ── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="product-card overflow-hidden rounded-2xl">
      <div className="skeleton aspect-[16/10] w-full" />
      <div className="flex flex-col gap-2 p-4">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton mt-1 h-4 w-3/4 rounded" />
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="skeleton h-5 w-20 rounded" />
          <div className="skeleton h-4 w-16 rounded-full" />
        </div>
      </div>
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, action, children, className = '' }:
  { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mx-auto max-w-6xl px-4 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function SeeAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm font-medium transition hover:opacity-80"
      style={{ color: 'var(--c-accent)' }}>
      Все →
    </button>
  )
}

// ── Product row (horizontal scroll on mobile, grid on desktop) ───────────────

function ProductRow({ items, loading, catName, onOpen, onSeeAll, skeletons = 4 }:
  { items: PublicProduct[]; loading: boolean; catName?: (id: number | null) => string | undefined;
    onOpen: (slug: string) => void; onSeeAll?: () => void; skeletons?: number }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: skeletons }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (!items.length) return null
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map(p => (
        <ProductCard key={p.id} p={p}
          category={catName?.(p.category_id)}
          onOpen={() => onOpen(p.code || String(p.id))} />
      ))}
      {onSeeAll && (
        <button onClick={onSeeAll}
          className="product-card flex flex-col items-center justify-center gap-2 rounded-2xl p-4 text-sm font-medium transition"
          style={{ color: 'var(--c-muted)' }}>
          <span className="text-3xl">→</span>
          Смотреть все
        </button>
      )}
    </div>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────

export function Hero({ onCatalog }: { onCatalog: () => void }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-8 pb-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ color: 'var(--c-text)' }}>
        Цифровые товары<br />
        <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
          с мгновенной выдачей
        </span>
      </h1>
      <p className="mt-3 max-w-lg text-base" style={{ color: 'var(--c-muted)' }}>
        Подписки, подарочные карты, нейросети и многое другое — оплата в Telegram, товар приходит в бот.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={onCatalog}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          style={{ background: 'var(--c-accent)' }}>
          Перейти в каталог
        </button>
        <div className="flex flex-wrap gap-2 text-sm" style={{ color: 'var(--c-muted)' }}>
          {['⚡ Автовыдача', '🔒 Шифрование', '💬 Поддержка'].map(t => (
            <span key={t} className="chip">{t}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Popular services tiles ────────────────────────────────────────────────────

const SERVICE_EMOJIS: Record<string, string> = {
  'Нейросети': '🤖', 'Музыка': '🎵', 'Игры': '🎮', 'Видео': '📺',
  'Дизайн': '🎨', 'Работа': '💼', 'Обучение': '📚', 'Общее': '📦',
}

function ServiceTile({ name, emoji, count, onClick }:
  { name: string; emoji?: string; count: number; onClick: () => void }) {
  const icon = emoji || SERVICE_EMOJIS[name] || '📦'
  return (
    <button onClick={onClick}
      className="product-card flex flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center transition"
      style={{ minHeight: 96 }}>
      <span className="text-3xl leading-none">{icon}</span>
      <span className="text-sm font-semibold leading-tight" style={{ color: 'var(--c-text)' }}>{name}</span>
      <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{count} товаров</span>
    </button>
  )
}

export function PopularServices({ cats, onSelect }:
  { cats: PublicCategory[]; onSelect: (id: number) => void }) {
  const visible = cats.filter(c => c.product_count > 0)
  if (!visible.length) return null
  return (
    <Section title="Популярные направления" className="mt-8">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {visible.map(c => (
          <ServiceTile key={c.id} name={c.name} emoji={c.emoji}
            count={c.product_count} onClick={() => onSelect(c.id)} />
        ))}
      </div>
    </Section>
  )
}

// ── Auto-delivery section ─────────────────────────────────────────────────────

export function AutoDeliverySection({ items, loading, catName, onOpen, onSeeAll }:
  { items: PublicProduct[]; loading: boolean; catName: (id: number | null) => string | undefined;
    onOpen: (slug: string) => void; onSeeAll: () => void }) {
  if (!loading && !items.length) return null
  return (
    <Section title="⚡ Мгновенная выдача" action={<SeeAllButton onClick={onSeeAll} />} className="mt-10">
      <ProductRow items={items} loading={loading} catName={catName} onOpen={onOpen} />
    </Section>
  )
}

// ── Generic products section (Popular / New / Picks) ─────────────────────────

export function ProductsSection({ title, emoji, items, loading, catName, onOpen, onSeeAll }:
  { title: string; emoji?: string; items: PublicProduct[]; loading: boolean;
    catName: (id: number | null) => string | undefined;
    onOpen: (slug: string) => void; onSeeAll?: () => void }) {
  if (!loading && !items.length) return null
  return (
    <Section title={emoji ? `${emoji} ${title}` : title}
      action={onSeeAll ? <SeeAllButton onClick={onSeeAll} /> : undefined}
      className="mt-10">
      <ProductRow items={items} loading={loading} catName={catName} onOpen={onOpen} skeletons={4} />
    </Section>
  )
}

// ── Category task tiles ───────────────────────────────────────────────────────

const TASK_CATS = [
  { label: 'Нейросети', emoji: '🤖' },
  { label: 'Дизайн', emoji: '🎨' },
  { label: 'Работа', emoji: '💼' },
  { label: 'Развлечения', emoji: '🎬' },
  { label: 'Игры', emoji: '🎮' },
  { label: 'Музыка', emoji: '🎵' },
  { label: 'Обучение', emoji: '📚' },
  { label: 'Видео', emoji: '📺' },
]

export function CategoryTasks({ cats, onSelect }:
  { cats: PublicCategory[]; onSelect: (id: number | null, query?: string) => void }) {
  const catMap = new Map(cats.map(c => [c.name.toLowerCase(), c]))
  return (
    <Section title="Категории по задачам" className="mt-10">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-4 md:grid-cols-8">
        {TASK_CATS.map(({ label, emoji }) => {
          const cat = catMap.get(label.toLowerCase())
          return (
            <button key={label}
              onClick={() => cat ? onSelect(cat.id) : onSelect(null, label)}
              className="product-card flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center transition">
              <span className="text-2xl">{emoji}</span>
              <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>{label}</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────

const STEPS = [
  { n: '1', title: 'Выберите товар', text: 'Найдите нужный сервис, тариф и срок подписки в каталоге.' },
  { n: '2', title: 'Оплатите', text: 'Оплата через Telegram Stars прямо в боте — быстро и безопасно.' },
  { n: '3', title: 'Получите', text: 'Товар придёт в бот сразу после оплаты. Поддержка там же.' },
]

export function HowItWorks() {
  return (
    <Section title="Как проходит покупка" className="mt-12">
      <div className="grid gap-4 sm:grid-cols-3">
        {STEPS.map(s => (
          <div key={s.n} className="card flex flex-col gap-3 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ background: 'var(--c-accent)' }}>
              {s.n}
            </span>
            <div className="font-semibold" style={{ color: 'var(--c-text)' }}>{s.title}</div>
            <div className="text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>{s.text}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Support strip ─────────────────────────────────────────────────────────────

export function SupportStrip({ botUsername }: { botUsername: string }) {
  return (
    <section className="mt-12 border-t" style={{ borderColor: 'var(--c-border)' }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <div className="font-semibold" style={{ color: 'var(--c-text)' }}>Остались вопросы?</div>
          <div className="mt-0.5 text-sm" style={{ color: 'var(--c-muted)' }}>Поддержка отвечает в Telegram. Возврат в соответствии с условиями.</div>
        </div>
        {botUsername && (
          <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener"
            className="shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#229ED9' }}>
            Написать в поддержку
          </a>
        )}
      </div>
    </section>
  )
}

// ── Loading full-page ─────────────────────────────────────────────────────────

export function PageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8 text-[var(--c-accent)]" />
    </div>
  )
}
