import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { api, getAuthToken, setAuthToken } from "@/lib/api/client"

export interface AuthUser {
  id: number
  email: string
  /** Rol de admin (is_admin) — afișează panoul de administrare */
  isAdmin?: boolean
  /** Planul de abonament: "free" (cu limite) sau "pro" (nelimitat + partajare) */
  plan?: "free" | "pro"
}

interface AuthValue {
  user: AuthUser | null
  /** Adevărat după ce s-a încheiat validarea tokenului salvat la pornire */
  ready: boolean
  /** Mod „deconectat" ales explicit: folosești editorul fără cont (doar salvare locală) */
  guest: boolean
  /** Intră în editor fără cont (de pe pagina de login) */
  continueAsGuest: () => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  /** Schimbă emailul și/sau parola (cere parola curentă). Reemite tokenul. */
  updateAccount: (
    currentPassword: string,
    changes: { email?: string; newPassword?: string },
  ) => Promise<void>
  /** Șterge contul curent (cere parola) și deconectează. */
  deleteAccount: (password: string) => Promise<void>
  /** Reîncarcă datele contului din `/auth/me` (ex. după upgrade la Pro). */
  refreshUser: () => Promise<void>
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
  const [guest, setGuest] = useState(false)

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

  async function updateAccount(
    currentPassword: string,
    changes: { email?: string; newPassword?: string },
  ) {
    const data = await api<{ token: string; user: AuthUser }>("/auth/me", {
      method: "PUT",
      body: { currentPassword, ...changes },
    })
    setAuthToken(data.token)
    setUser(data.user)
  }

  async function deleteAccount(password: string) {
    await api("/auth/me", { method: "DELETE", body: { password } })
    setAuthToken(null)
    setUser(null)
  }

  async function refreshUser() {
    try {
      const data = await api<{ user: AuthUser }>("/auth/me")
      setUser(data.user)
    } catch {
      /* ignorăm — păstrăm userul curent */
    }
  }

  function logout() {
    setAuthToken(null)
    setUser(null)
    setGuest(false) // deconectarea readuce la pagina de login (nu în mod guest)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        guest,
        continueAsGuest: () => setGuest(true),
        login,
        register,
        updateAccount,
        deleteAccount,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth trebuie folosit în interiorul unui AuthProvider")
  return ctx
}
