import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react"
import {
  scoreReducer,
  initialScoreState,
  type ScoreAction,
  type ScoreState,
} from "@/state/scoreReducer"

interface ScoreEditorValue extends ScoreState {
  dispatch: Dispatch<ScoreAction>
}

const ScoreEditorContext = createContext<ScoreEditorValue | null>(null)

/**
 * Sursa unică de adevăr pentru partitură: notele, selecția și durata curentă
 * de input. Atât portativul interactiv (`InteractiveStave`) cât și toolbar-ul
 * (`NoteToolbar`) citesc starea de aici și editează prin `dispatch`.
 */
export function ScoreEditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scoreReducer, initialScoreState)

  return (
    <ScoreEditorContext.Provider value={{ ...state, dispatch }}>
      {children}
    </ScoreEditorContext.Provider>
  )
}

export function useScoreEditor() {
  const ctx = useContext(ScoreEditorContext)
  if (!ctx) {
    throw new Error("useScoreEditor trebuie folosit în interiorul unui ScoreEditorProvider")
  }
  return ctx
}
