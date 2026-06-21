import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api/client"
import { useAuth } from "@/state/authContext"

/**
 * La revenirea de la Stripe Checkout (`?checkout=success&session_id=…` în URL),
 * confirmă plata pe server și reîmprospătează planul; la `?checkout=cancel` doar
 * anunță. Curăță apoi parametrii din URL și arată un mesaj scurt.
 */
export function BillingReturn() {
  const { refreshUser } = useAuth()
  const [toast, setToast] = useState<string | null>(null)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    // funcție imbricată (nu setState sincron direct în efect)
    const run = async () => {
      const params = new URLSearchParams(window.location.search)
      const checkout = params.get("checkout")
      if (!checkout) return
      const sessionId = params.get("session_id")
      window.history.replaceState({}, "", window.location.pathname) // curăță URL-ul

      if (checkout === "cancel") {
        setToast("Plata a fost anulată.")
        return
      }
      if (checkout === "success" && sessionId) {
        try {
          await api("/billing/confirm", { method: "POST", body: { sessionId } })
          await refreshUser()
          setToast("Felicitări — ești acum Pro! ✨")
        } catch (err) {
          setToast(err instanceof Error ? err.message : "Eroare la confirmarea plății")
        }
      }
    }
    void run()
  }, [refreshUser])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  if (!toast) return null
  return (
    <div className="fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 rounded-md border border-primary bg-surface px-4 py-2 text-sm text-foreground shadow-lg">
      {toast}
    </div>
  )
}
