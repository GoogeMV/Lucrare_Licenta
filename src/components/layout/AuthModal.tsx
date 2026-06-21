import { useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/state/authContext"

/**
 * Fereastră de autentificare / înregistrare (email + parolă). Comută între
 * „Intră în cont" și „Creează cont". La succes, se închide singură.
 */
export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === "login") await login(email, password)
      else await register(email, password)
      onClose()
      setEmail("")
      setPassword("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "login" ? "Intră în cont" : "Creează cont"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Parolă {mode === "register" && <span className="opacity-60">(min. 6 caractere)</span>}
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-primary"
            />
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" disabled={busy} className="mt-1">
            {busy ? "Se procesează…" : mode === "login" ? "Intră" : "Creează cont"}
          </Button>
        </form>

        <p className="mt-3 text-center text-xs text-foreground-muted">
          {mode === "login" ? "Nu ai cont?" : "Ai deja cont?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login")
              setError(null)
            }}
            className="text-primary hover:underline"
          >
            {mode === "login" ? "Creează unul" : "Intră în cont"}
          </button>
        </p>
      </div>
    </div>
  )
}
