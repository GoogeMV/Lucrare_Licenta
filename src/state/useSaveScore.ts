import { useAuth } from "@/state/authContext"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { api } from "@/lib/api/client"
import { saveScore } from "@/lib/storage/scoreStorage"

export type SaveResult = "cloud" | "local" | "skip"

/**
 * Logica unică de salvare, folosită de butonul „Salvează în cont", de Ctrl+S și
 * de autosave. Decide unde salvează:
 *  - logat + avem o partitură-cloud curentă (`currentScoreId`) → ACTUALIZEAZĂ în cont;
 *  - logat, fără partitură-cloud, dar `allowCreate` (acțiune explicită) → CREEAZĂ în cont;
 *  - altfel (guest, sau autosave fără partitură-cloud) → salvare LOCALĂ (localStorage).
 * Sare peste partiturile goale (`skip`), ca să nu creeze intrări inutile.
 */
export function useSaveScore() {
  const { user } = useAuth()
  const { staves, timeSignature, barlines, meta, currentScoreId, setCurrentScoreId } = useScoreEditor()

  return async function save(options: { allowCreate?: boolean } = {}): Promise<SaveResult> {
    const hasNotes = staves.some((s) => s.notes.length > 0)
    if (!hasNotes) return "skip"

    const title = meta.title || "Partitură fără titlu"
    const data = {
      staves,
      timeSignature,
      barlines,
      title: meta.title,
      composer: meta.composer,
      tempo: meta.tempo,
      tempoBeat: meta.tempoBeat,
      tempoBeatDotted: meta.tempoBeatDotted,
      tempoText: meta.tempoText,
    }

    if (user) {
      if (currentScoreId != null) {
        await api(`/scores/${currentScoreId}`, { method: "PUT", body: { title, data } })
        return "cloud"
      }
      if (options.allowCreate) {
        const { id } = await api<{ id: number }>("/scores", { method: "POST", body: { title, data } })
        setCurrentScoreId(id)
        return "cloud"
      }
    }

    // nelogat, sau autosave fără partitură-cloud curentă → backup local
    saveScore(
      staves,
      timeSignature,
      {
        title: meta.title,
        composer: meta.composer,
        tempo: meta.tempo,
        tempoBeat: meta.tempoBeat,
        tempoBeatDotted: meta.tempoBeatDotted,
        tempoText: meta.tempoText,
      },
      barlines,
    )
    return "local"
  }
}
