import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/state/authContext"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { useSaveScore, type SaveResult } from "@/state/useSaveScore"

const AUTOSAVE_MS = 3 * 60 * 1000 // 3 minute

/**
 * Salvare automată (la 3 minute) + scurtătura Ctrl/Cmd+S. Folosește `useSaveScore`
 * (cont dacă ești logat și ai o partitură-cloud curentă, altfel local). Autosave-ul
 * NU creează partituri noi în cont (ca să nu apară duplicate goale); Ctrl+S, fiind
 * o acțiune explicită, poate crea. Arată o confirmare scurtă (toast).
 */
export function AutoSave() {
  const save = useSaveScore()
  const { user } = useAuth()
  const { setCurrentScoreId } = useScoreEditor()
  const [toast, setToast] = useState<string | null>(null)

  // ref la cea mai recentă `save` (se recreează la fiecare render) — ca timer-ul și
  // listener-ul să o apeleze mereu pe cea curentă fără să se re-abonaze
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  const toastTimer = useRef<number | null>(null)

  const notify = useCallback((result: SaveResult) => {
    if (result === "skip") return
    setToast(result === "cloud" ? "Salvat în cont ✓" : "Salvat local ✓")
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2000)
  }, [])

  // schimbarea utilizatorului (login/logout) invalidează partitura-cloud curentă,
  // ca autosave-ul să nu suprascrie partitura altui cont
  useEffect(() => {
    setCurrentScoreId(null)
  }, [user?.id, setCurrentScoreId])

  // autosave la interval fix (fără creare automată în cont)
  useEffect(() => {
    const id = window.setInterval(() => {
      void saveRef.current({ allowCreate: false }).then(notify).catch(() => {})
    }, AUTOSAVE_MS)
    return () => window.clearInterval(id)
  }, [notify])

  // Ctrl+S / Cmd+S → salvare explicită (poate crea în cont)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void saveRef.current({ allowCreate: true }).then(notify).catch(() => setToast("Eroare la salvare"))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [notify])

  if (!toast) return null
  return (
    <div className="pointer-events-none fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground shadow-lg">
      {toast}
    </div>
  )
}
