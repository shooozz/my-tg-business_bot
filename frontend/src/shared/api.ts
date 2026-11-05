let csrf = ''

export function setCsrf(token: string) {
  csrf = token
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** JSON call to the FastAPI backend. Admin writes need the CSRF token from login. */
export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch('/api/' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: unknown = null
  try {
    data = await r.json()
  } catch {
    // empty or non-JSON body
  }
  if (!r.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail
    const text = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? 'Проверьте введённые данные'
      : `Ошибка сервера (${r.status})`
    throw new ApiError(r.status, text)
  }
  return data as T
}

export function errText(e: unknown) {
  return e instanceof Error ? e.message : 'Что-то пошло не так'
}
