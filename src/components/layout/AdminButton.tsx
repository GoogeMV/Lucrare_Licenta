import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/state/authContext"
import { AdminDashboard } from "@/components/layout/AdminDashboard"

/** Buton spre panoul de administrare — apare DOAR pentru utilizatorii admin. */
export function AdminButton() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user?.isAdmin) return null
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Panou de administrare">
        <ShieldCheck className="size-4" /> Admin
      </Button>
      <AdminDashboard open={open} onClose={() => setOpen(false)} />
    </>
  )
}
