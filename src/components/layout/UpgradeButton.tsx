import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api/client"
import { MockCheckout } from "@/components/layout/MockCheckout"

/**
 * Pornește upgrade-ul la Pro. Serverul decide: dacă Stripe e configurat →
 * redirecționăm la Stripe Checkout (`url`); altfel (`mock`) → deschidem pagina de
 * plată simulată din aplicație. Așa merge și cu, și fără cont Stripe.
 */
export function UpgradeButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mockOpen, setMockOpen] = useState(false)

  async function upgrade() {
    setBusy(true)
    setError(null)
    try {
      const data = await api<{ url?: string; mock?: boolean }>("/billing/checkout", { method: "POST" })
      if (data.url) {
        window.location.href = data.url
        return
      }
      // fără Stripe → plată simulată în aplicație
      setMockOpen(true)
      setBusy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare")
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={upgrade} disabled={busy} className={className}>
        <Sparkles className="size-4" /> {busy ? "Se deschide…" : "Treci la Pro"}
      </Button>
      {error && <p className="px-1 pt-1 text-xs text-destructive">{error}</p>}
      <MockCheckout open={mockOpen} onClose={() => setMockOpen(false)} />
    </>
  )
}
