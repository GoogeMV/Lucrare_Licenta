import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { api, getAuthToken, setAuthToken } from "@/lib/api/client"

export interface AuthUser {
  id: number
  email: string
}

interface AuthValue {
  user: AuthUser | null
  /** Adevărat după ce s-a încheiat validarea tokenului salvat la pornire */
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Starea de autentificare (token JWT în localStorage). La pornire, dacă există
 * un token salvat, îl validează cerând `/auth/me`; altfel rămâne nelogat.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    // funcție imbricată (nu setState direct în corpul efectului)
    const validate = async () => {
      if (!getAuthToken()) {
        setReady(true)
        return
      }
      try {
        const data = await api<{ user: AuthUser }>("/auth/me")
        if (active) setUser(data.user)
      } catch {
        setAuthToken(null)
      } finally {
        if (active) setReady(true)
      }
    }
    void validate()
    return () => {
      active = false
    }
  }, [])

  async function login(email: string, password: string) {
    const data = await api<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    })
    setAuthToken(data.token)
    setUser(data.user)
  }

  async function register(email: string, password: string) {
    const data = await api<{ token: string; user: AuthUser }>("/auth/register", {
      method: "POST",
      body: { email, password },
    })
    setAuthToken(data.token)
    setUser(data.user)
  }

  function logout() {
    setAuthToken(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, ready, login, register, logout }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth trebuie folosit în interiorul unui AuthProvider")
  return ctx
}
