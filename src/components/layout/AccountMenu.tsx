import { useEffect, useRef, useState } from "react"
import { ChevronDown, LogOut, Save, Trash2, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/state/authContext"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { api } from "@/lib/api/client"
import { AuthModal } from "@/components/layout/AuthModal"
import type { Staff, TimeSignature } from "@/types/score"

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"

interface ScoreListItem {
  id: number
  title: string
  updated_at: string
}

/** Forma salvată în cloud (aceeași cu salvarea locală) */
interface CloudScoreData {
  staves: Staff[]
  timeSignature: TimeSignature
  title: string
  composer: string
  tempo: number
  tempoBeat: import("@/types/score").Duration
  tempoBeatDotted: boolean
  tempoText: string
}

/**
 * Controlul de cont din bara de sus: dacă nu ești logat, butonul „Cont" deschide
 * fereastra de autentificare; dacă ești logat, un dropdown cu salvarea în cont,
 * lista „Partiturile mele" (deschide/șterge) și deconectarea.
 */
export function AccountMenu() {
  const { user, logout } = useAuth()
  const { staves, timeSignature, meta, setMeta, dispatch } = useScoreEditor()
  const [authOpen, setAuthOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [scores, setScores] = useState<ScoreListItem[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  async function refreshList() {
    try {
      const data = await api<{ scores: ScoreListItem[] }>("/scores")
      setScores(data.scores)
    } catch {
      /* ignorăm — lista rămâne goală */
    }
  }

  function openMenu() {
    setOpen(true)
    setStatus(null)
    void refreshList()
  }

  async function handleSave() {
    const data: CloudScoreData = {
      staves,
      timeSignature,
      title: meta.title,
      composer: meta.composer,
      tempo: meta.tempo,
      tempoBeat: meta.tempoBeat,
      tempoBeatDotted: meta.tempoBeatDotted,
      tempoText: meta.tempoText,
    }
    try {
      await api("/scores", { method: "POST", body: { title: meta.title || "Partitură fără titlu", data } })
      setStatus("Salvat în cont ✓")
      void refreshList()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Eroare la salvare")
    }
  }

  async function handleOpen(id: number) {
    try {
      const { score } = await api<{ score: { data: CloudScoreData } }>(`/scores/${id}`)
      const d = score.data
      dispatch({ type: "loadScore", staves: d.staves, timeSignature: d.timeSignature })
      setMeta({
        title: d.title ?? "",
        composer: d.composer ?? "",
        tempo: d.tempo ?? 120,
        tempoBeat: d.tempoBeat ?? "quarter",
        tempoBeatDotted: d.tempoBeatDotted ?? false,
        tempoText: d.tempoText ?? "",
      })
      setOpen(false)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Eroare la deschidere")
    }
  }

  async function handleDelete(id: number) {
    try {
      await api(`/scores/${id}`, { method: "DELETE" })
      void refreshList()
    } catch {
      /* ignorăm */
    }
  }

  // --- nelogat: buton care deschide fereastra de autentificare ---
  if (!user) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setAuthOpen(true)}>
          Cont
        </Button>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </>
    )
  }

  // --- logat: dropdown cu salvare + partiturile mele + deconectare ---
  return (
    <div ref={wrapperRef} className="relative">
      <Button variant="outline" size="sm" onClick={() => (open ? setOpen(false) : openMenu())}>
        <UserRound className="size-4" />
        <span className="max-w-28 truncate">{user.email}</span>
        <ChevronDown className="size-3 opacity-60" />
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-md border border-border bg-surface p-1 shadow-lg">
          <button type="button" className={MENU_ITEM_CLASS} onClick={handleSave}>
            <Save className="size-4" /> Salvează în cont
          </button>
          {status && <p className="px-2 py-1 text-xs text-foreground-muted">{status}</p>}

          <div className="my-1 border-t border-border" />
          <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-foreground-muted uppercase">
            Partiturile mele
          </p>
          <div className="max-h-60 overflow-y-auto">
            {scores.length === 0 ? (
              <p className="px-2 py-1 text-xs text-foreground-muted">Nicio partitură salvată.</p>
            ) : (
              scores.map((s) => (
                <div key={s.id} className="flex items-center gap-1 rounded-sm pr-1 hover:bg-surface-hover">
                  <button
                    type="button"
                    onClick={() => handleOpen(s.id)}
                    className="flex-1 truncate px-2 py-1.5 text-left text-sm text-foreground"
                    title={`${s.title} · ${s.updated_at}`}
                  >
                    {s.title || "Partitură fără titlu"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    aria-label={`Șterge ${s.title}`}
                    className="rounded-sm p-1 text-foreground-muted transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className={MENU_ITEM_CLASS}
            onClick={() => {
              logout()
              setOpen(false)
            }}
          >
            <LogOut className="size-4" /> Deconectare
          </button>
        </div>
      )}
    </div>
  )
}
