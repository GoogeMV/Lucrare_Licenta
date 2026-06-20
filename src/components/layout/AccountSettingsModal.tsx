import { useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/state/authContext"

const INPUT_CLASS =
  "rounded-md border border-border bg-surface-hover px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-primary"

/**
 * Setări cont: schimbă emailul și/sau parola (cere parola curentă) și șterge
 * contul. Completează CRUD-ul de utilizator cerut de coordonator (pe lângă
 * register/login). La ștergerea contului, AuthProvider deconectează automat.
 */
export function AccountSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateAccount, deleteAccount } = useAuth()
  const [email, setEmail] = useState(user?.email ?? "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!open) return null

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setStatus(null)
    setBusy(true)
    try {
      const changes: { email?: string; newPassword?: string } = {}
      if (email && email !== user?.email) changes.email = email
      if (newPassword) changes.newPassword = newPassword
      if (!changes.email && !changes.newPassword) {
        setError("Nu ai schimbat nimic.")
        return
      }
      await updateAccount(currentPassword, changes)
      setStatus("Salvat ✓")
      setCurrentPassword("")
      setNewPassword("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setError(null)
    setBusy(true)
    try {
      await deleteAccount(currentPassword)
      onClose() // contul a dispărut → AuthProvider a deconectat
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
          <h2 className="text-base font-semibold text-foreground">Setări cont</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Parolă nouă <span className="opacity-60">(lasă gol ca s-o păstrezi; min. 6)</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Parola curentă <span className="opacity-60">(confirmare)</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {status && <p className="text-xs text-primary">{status}</p>}

          <Button type="submit" disabled={busy} className="mt-1">
            {busy ? "Se procesează…" : "Salvează modificările"}
          </Button>
        </form>

        <div className="my-4 border-t border-border" />

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(true)
              setError(null)
              setStatus(null)
            }}
            className="text-xs text-destructive hover:underline"
          >
            Șterge contul…
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-xs text-foreground">
              Ștergerea e <strong>definitivă</strong> — dispar contul și toate partiturile.
              Introdu parola curentă deasupra, apoi confirmă.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={busy || !currentPassword} onClick={handleDelete}>
                {busy ? "Se șterge…" : "Șterge definitiv"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Renunță
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
