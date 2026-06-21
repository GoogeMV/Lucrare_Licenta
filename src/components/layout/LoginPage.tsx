import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/state/authContext"

const INPUT_CLASS =
  "rounded-md border border-border bg-surface-hover px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary"

/**
 * Pagina de autentificare la nivel de aplicație: cât timp nu ești logat, ea ține
 * locul editorului (vezi gate-ul din App). Comută între „Intră" și „Creează cont".
 */
export function LoginPage() {
  const { login, register, continueAsGuest } = useAuth()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === "login") await login(email, password)
      else await register(email, password)
      // la succes, gate-ul din App montează editorul automat
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">NotationSoft</h1>
        <p className="mt-1 text-sm text-foreground-muted">Editor de partituri</p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          {mode === "login" ? "Intră în cont" : "Creează cont"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Email
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
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
              className={INPUT_CLASS}
            />
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" disabled={busy} className="mt-1">
            {busy ? "Se procesează…" : mode === "login" ? "Intră" : "Creează cont"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-foreground-muted">
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

        <div className="mt-4 flex items-center gap-3 text-[11px] text-foreground-muted">
          <span className="h-px flex-1 bg-border" />
          sau
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button type="button" variant="outline" className="mt-3 w-full" onClick={continueAsGuest}>
          Continuă deconectat
        </Button>
        <p className="mt-1.5 text-center text-[11px] text-foreground-muted">
          Editezi și salvezi local; salvarea în cont nu e disponibilă.
        </p>
      </div>
    </div>
  )
}
