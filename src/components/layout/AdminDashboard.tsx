import { useEffect, useState } from "react"
import { X, Trash2, ShieldCheck } from "lucide-react"
import { api } from "@/lib/api/client"
import { useAuth } from "@/state/authContext"

interface Stats {
  users: number
  scores: number
  shares: number
  proUsers: number
  newUsers7d: number
  newScores7d: number
}
interface AdminUser {
  id: number
  email: string
  is_admin: boolean
  plan: string
  created_at: string
  score_count: number
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-hover px-3 py-2">
      <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[11px] text-foreground-muted">{label}</div>
    </div>
  )
}

/** Panou de administrare (doar pentru admini): statistici de utilizare + lista
 *  utilizatorilor cu numărul lor de partituri, cu ștergere (moderare). */
export function AdminDashboard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      try {
        const [s, u] = await Promise.all([
          api<{ stats: Stats }>("/admin/stats"),
          api<{ users: AdminUser[] }>("/admin/users"),
        ])
        if (!active) return
        setStats(s.stats)
        setUsers(u.users)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Eroare")
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [open])

  if (!open) return null

  async function handleDelete(id: number, email: string) {
    if (!window.confirm(`Ștergi contul ${email} și toate partiturile lui?`)) return
    try {
      await api(`/admin/users/${id}`, { method: "DELETE" })
      setUsers((list) => list.filter((u) => u.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la ștergere")
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ShieldCheck className="size-4 text-primary" /> Administrare
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

        {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

        {stats && (
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <StatCard label="Utilizatori" value={stats.users} />
            <StatCard label="din care Pro" value={stats.proUsers} />
            <StatCard label="Partituri" value={stats.scores} />
            <StatCard label="Partajări" value={stats.shares} />
            <StatCard label="Conturi noi (7z)" value={stats.newUsers7d} />
            <StatCard label="Partituri noi (7z)" value={stats.newScores7d} />
          </div>
        )}

        <p className="mb-1 text-[11px] font-medium tracking-wide text-foreground-muted uppercase">Utilizatori</p>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-[11px] text-foreground-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Email</th>
                <th className="px-2 py-1.5 font-medium">Partituri</th>
                <th className="px-2 py-1.5 font-medium">Înregistrat</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-2 py-1.5 text-foreground">
                    {u.email}
                    {u.is_admin && <span className="ml-1 text-[10px] text-primary">(admin)</span>}
                    {u.plan === "pro" && <span className="ml-1 text-[10px] text-primary">Pro</span>}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-foreground-muted">{u.score_count}</td>
                  <td className="px-2 py-1.5 text-foreground-muted">{new Date(u.created_at).toLocaleDateString("ro-RO")}</td>
                  <td className="px-2 py-1.5 text-right">
                    {/* nu poți șterge propriul cont, nici un alt admin (protejați între ei) */}
                    {u.id !== user?.id && !u.is_admin && (
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id, u.email)}
                        aria-label={`Șterge ${u.email}`}
                        className="rounded-sm p-1 text-foreground-muted transition-colors hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
