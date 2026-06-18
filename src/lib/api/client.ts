/**
 * Client HTTP minimal pentru backend-ul NotationSoft (server/). În dev, cererile
 * `/api/...` sunt proxate de Vite către http://localhost:4000 (vezi vite.config).
 * Tokenul JWT e ținut în localStorage și atașat automat ca `Authorization`.
 */

const TOKEN_KEY = "notationsoft-token"
let authToken: string | null = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null

export function getAuthToken(): string | null {
  return authToken
}

export function setAuthToken(token: string | null) {
  authToken = token
  if (typeof localStorage === "undefined") return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Eroare server (${res.status})`)
  }
  return data as T
}
