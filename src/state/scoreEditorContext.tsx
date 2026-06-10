import { createContext, useContext, useReducer, useState, type Dispatch, type ReactNode } from "react"
import {
  historyReducer,
  initialHistoryState,
  type HistoryAction,
  type ScoreState,
} from "@/state/scoreReducer"

/**
 * Modul de afișare al partiturii (preferință de UI, nu face parte din modelul
 * partiturii — de aceea stă lângă reducer, nu în el):
 *  - "page": rândurile se rup ca pe o pagină tipărită (implicit)
 *  - "continuous": un singur rând infinit, cu derulare orizontală (ca în MuseScore)
 */
export type ViewMode = "page" | "continuous"

/** Metadatele partiturii (titlu, compozitor, tempo ♩=X) — date ale piesei
 *  (se salvează și se exportă), dar în afara istoricului undo: tastarea în
 *  titlu sau tragerea slider-ului de tempo nu trebuie să creeze pași de anulare */
export interface ScoreMeta {
  title: string
  composer: string
  /** Tempo în pătrimi pe minut (indicația ♩ = X de pe foaie) */
  tempo: number
}

interface ScoreEditorValue extends ScoreState {
  dispatch: Dispatch<HistoryAction>
  canUndo: boolean
  canRedo: boolean
  meta: ScoreMeta
  setMeta: (changes: Partial<ScoreMeta>) => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}

const ScoreEditorContext = createContext<ScoreEditorValue | null>(null)

/**
 * Sursa unică de adevăr pentru partitură: notele, selecția și durata curentă
 * de input, cu istoric de undo/redo. Toate componentele citesc starea de aici
 * și editează prin `dispatch` (inclusiv `{type:"undo"}` / `{type:"redo"}`).
 */
export function ScoreEditorProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, initialHistoryState)
  const [viewMode, setViewMode] = useState<ViewMode>("page")
  const [meta, setMetaState] = useState<ScoreMeta>({ title: "", composer: "", tempo: 120 })

  return (
    <ScoreEditorContext.Provider
      value={{
        ...history.present,
        dispatch,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        meta,
        setMeta: (changes) => setMetaState((current) => ({ ...current, ...changes })),
        viewMode,
        setViewMode,
      }}
    >
      {children}
    </ScoreEditorContext.Provider>
  )
}

// hook-ul stă lângă provider (idiomatic pentru context), deci fișierul nu exportă
// doar componente — Fast Refresh face reload complet la editare; doar în dev
// eslint-disable-next-line react-refresh/only-export-components
export function useScoreEditor() {
  const ctx = useContext(ScoreEditorContext)
  if (!ctx) {
    throw new Error("useScoreEditor trebuie folosit în interiorul unui ScoreEditorProvider")
  }
  return ctx
}
