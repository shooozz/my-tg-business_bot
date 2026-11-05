import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50',
}

export function Button({ variant = 'secondary', className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...rest} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`} />
}

const TONES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  bad: 'bg-rose-50 text-rose-700 ring-rose-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  info: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
}
export type Tone = keyof typeof TONES

export function Badge({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>
}

export function Toggle({ checked, onChange, disabled, label }:
  { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="text-base font-semibold text-slate-800">{title}</div>
      {text && <p className="max-w-md text-sm text-slate-500">{text}</p>}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
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
        <div key={t.id} className={`rounded-xl px-4 py-3 text-sm text-white shadow-lg ${t.bad ? 'bg-rose-600' : 'bg-slate-900'}`}>{t.text}</div>
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
