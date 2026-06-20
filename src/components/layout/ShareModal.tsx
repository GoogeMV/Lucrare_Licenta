import { useEffect, useState, type FormEvent } from "react"
import { X, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api/client"

const CLEF_SHORT: Record<string, string> = { treble: "cheie sol", bass: "cheie fa", alto: "cheie do" }

interface StaffInfo {
  id: string
  instrument: string
  clef: string
}
interface ShareRow {
  id: number
  staff_ids: string[]
  shared_with_email: string
}

const INPUT_CLASS =
  "flex-1 rounded-md border border-border bg-surface-hover px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-primary"

/**
 * Partajare granulară a unei partituri: alegi destinatarul (după email) și CE
 * portative îi sunt vizibile (bife). Listează și partajările existente (revocare).
 * Toate bifate = toată partitura (`staffIds: []`, prinde și portativele viitoare).
 */
export function ShareModal({
  scoreId,
  scoreTitle,
  open,
  onClose,
}: {
  scoreId: number
  scoreTitle: string
  open: boolean
  onClose: () => void
}) {
  const [staves, setStaves] = useState<StaffInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [email, setEmail] = useState("")
  const [shares, setShares] = useState<ShareRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      try {
        const { score } = await api<{ score: { data: { staves: StaffInfo[] } } }>(`/scores/${scoreId}`)
        if (!active) return
        const st = score.data.staves ?? []
        setStaves(st)
        setSelected(new Set(st.map((s) => s.id))) // implicit: toate
        const data = await api<{ shares: ShareRow[] }>(`/scores/${scoreId}/shares`)
        if (active) setShares(data.shares)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Eroare la încărcare")
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [open, scoreId])

  if (!open) return null

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleShare(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setStatus(null)
    if (selected.size === 0) {
      setError("Alege cel puțin un portativ.")
      return
    }
    setBusy(true)
    try {
      // toate bifate → [] (toată partitura); altfel doar id-urile alese
      const staffIds = selected.size === staves.length ? [] : [...selected]
      await api(`/scores/${scoreId}/shares`, { method: "POST", body: { email, staffIds } })
      setStatus(`Partajat cu ${email} ✓`)
      setEmail("")
      const data = await api<{ shares: ShareRow[] }>(`/scores/${scoreId}/shares`)
      setShares(data.shares)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la partajare")
    } finally {
      setBusy(false)
    }
  }

  async function revoke(shareId: number) {
    try {
      await api(`/shares/${shareId}`, { method: "DELETE" })
      setShares((s) => s.filter((x) => x.id !== shareId))
    } catch {
      /* ignorăm */
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Partajează partitura</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-4 truncate text-xs text-foreground-muted">{scoreTitle || "Partitură fără titlu"}</p>

        <form onSubmit={handleShare} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-foreground-muted">
            Email-ul destinatarului
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prieten@example.com"
                className={INPUT_CLASS}
              />
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "…" : "Partajează"}
              </Button>
            </div>
          </label>

          <div className="flex flex-col gap-1 text-xs text-foreground-muted">
            Portative vizibile
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
              {staves.length === 0 ? (
                <p className="px-1 py-1 text-foreground-muted">Partitura nu are portative.</p>
              ) : (
                staves.map((st) => (
                  <label key={st.id} className="flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-hover">
                    <input type="checkbox" checked={selected.has(st.id)} onChange={() => toggle(st.id)} />
                    <span className="text-sm text-foreground">
                      {st.instrument}
                      <span className="text-foreground-muted"> · {CLEF_SHORT[st.clef] ?? st.clef}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {status && <p className="text-xs text-primary">{status}</p>}
        </form>

        {shares.length > 0 && (
          <>
            <div className="my-4 border-t border-border" />
            <p className="mb-1 text-[11px] font-medium tracking-wide text-foreground-muted uppercase">
              Partajat cu
            </p>
            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
              {shares.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-hover">
                  <span className="flex-1 truncate text-sm text-foreground">
                    {s.shared_with_email}
                    <span className="text-foreground-muted">
                      {" · "}
                      {!s.staff_ids || s.staff_ids.length === 0 ? "toate" : `${s.staff_ids.length} portative`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => revoke(s.id)}
                    aria-label={`Revocă pentru ${s.shared_with_email}`}
                    className="rounded-sm p-1 text-foreground-muted transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
