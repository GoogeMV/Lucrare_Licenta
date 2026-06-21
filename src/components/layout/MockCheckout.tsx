import { useState, type FormEvent } from "react"
import { X, Lock, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api/client"
import { useAuth } from "@/state/authContext"

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-surface-hover px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-primary"

/**
 * Pagină de plată SIMULATĂ (demo) — folosită când Stripe nu e configurat. Imită un
 * formular de card (precompletat cu cardul de test), „procesează" ~1s, apoi cere
 * serverului trecerea pe Pro. NU se mișcă bani; e clar etichetată ca demo.
 */
export function MockCheckout({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshUser } = useAuth()
  const [card, setCard] = useState("4242 4242 4242 4242")
  const [exp, setExp] = useState("12 / 34")
  const [cvc, setCvc] = useState("123")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function pay(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await new Promise((r) => setTimeout(r, 900)) // simulăm procesarea
      await api("/billing/mock-confirm", { method: "POST" })
      await refreshUser()
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la plată")
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Lock className="size-4 text-primary" /> Plată — NotationSoft Pro
          </h2>
          {!busy && !done && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Închide"
              className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <p className="mb-4 text-[11px] text-foreground-muted">Plată simulată (demo) — niciun ban real nu se mișcă.</p>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check className="size-8 text-primary" />
            <p className="text-sm font-medium text-foreground">Plată reușită — ești acum Pro! ✨</p>
          </div>
        ) : (
          <form onSubmit={pay} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              Număr card
              <input value={card} onChange={(e) => setCard(e.target.value)} className={INPUT_CLASS} />
            </label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs text-foreground-muted">
                Expirare
                <input value={exp} onChange={(e) => setExp(e.target.value)} className={INPUT_CLASS} />
              </label>
              <label className="flex w-20 flex-col gap-1 text-xs text-foreground-muted">
                CVC
                <input value={cvc} onChange={(e) => setCvc(e.target.value)} className={INPUT_CLASS} />
              </label>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button type="submit" disabled={busy} className="mt-1">
              {busy ? "Se procesează…" : "Plătește (demo)"}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
