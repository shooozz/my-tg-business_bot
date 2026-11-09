import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cycleTheme, getMode, getTheme, initTheme, type Theme, type ThemeMode } from './theme'

const MODE_ICON: Record<ThemeMode, string> = { dark: '🌙', light: '☀️', system: '💻' }
const MODE_LABEL: Record<ThemeMode, string> = {
  dark:   'Тёмная тема — нажмите для светлой',
  light:  'Светлая тема — нажмите для системной',
  system: 'Системная тема — нажмите для тёмной',
}

/** Cycles dark → light → system → dark on each click. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getMode())
  const [_theme, setTheme] = useState<Theme>(() => getTheme())
  void _theme // used to trigger re-render when applied theme changes

  function handleClick() {
    const next = cycleTheme()
    setMode(next)
    // getTheme() returns the *applied* theme after setMode
    setTheme(getTheme())
  }

  return (
    <button
      onClick={handleClick}
      aria-label={MODE_LABEL[mode]}
      title={MODE_LABEL[mode]}
      className="rounded-lg px-2 py-1.5 text-sm transition-colors hover:opacity-80"
      style={{ color: 'var(--c-muted)', background: 'var(--c-bg3)' }}
    >
      {MODE_ICON[mode]}
    </button>
  )
}

// Export initTheme so main.tsx can call it.
export { initTheme }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({ variant = 'secondary', className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50'
  const variantClass =
    variant === 'primary'   ? 'bg-[var(--c-accent)] text-white hover:bg-[var(--c-acc-hov)] shadow-sm'
    : variant === 'ghost'   ? 'btn-ghost'
    : variant === 'danger'  ? 'btn-danger'
    : /* secondary */         'btn-secondary'
  return <button {...rest} className={`${base} ${variantClass} ${className}`} />
}

export type Tone = 'good' | 'bad' | 'warn' | 'info' | 'muted'

export function Badge({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium badge-${tone}`}>
      {children}
    </span>
  )
}

export function Toggle({ checked, onChange, disabled, label }:
  { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50"
      style={{ background: checked ? 'var(--c-accent)' : 'var(--c-bg3)' }}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>{title}</div>
      {text && <p className="max-w-md text-sm" style={{ color: 'var(--c-muted)' }}>{text}</p>}
      {children}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />
}

export function Modal({ title, onClose, children, footer, wide }:
  { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 modal-overlay"
      onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl shadow-xl sm:rounded-2xl modal-body ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between px-5 py-4 modal-header">
          <h3 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Закрыть"
            className="rounded-lg p-1 transition hover:opacity-80"
            style={{ color: 'var(--c-muted)', '--hover-bg': 'var(--c-bg3)' } as React.CSSProperties}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-3 modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// Tiny global toast: toast('text') from anywhere, <Toaster/> once per app.
type ToastItem = { id: number; text: string; bad: boolean }
let push: (t: ToastItem) => void = () => {}
let seq = 0
export function toast(text: string, bad = false) {
  push({ id: ++seq, text, bad })
}
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    push = t => {
      setItems(xs => [...xs, t])
      setTimeout(() => setItems(xs => xs.filter(x => x.id !== t.id)), 4500)
    }
    return () => { push = () => {} }
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4" role="status">
      {items.map(t => (
        <div key={t.id}
          className="rounded-xl px-4 py-3 text-sm text-white shadow-lg"
          style={{ background: t.bad ? 'var(--c-bad)' : 'var(--c-bg3)', color: t.bad ? '#fff' : 'var(--c-text)' }}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** Run an async action with a busy flag and toast on failure. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', true)
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}
