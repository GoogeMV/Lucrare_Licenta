import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import {
  historyReducer,
  initialHistoryState,
  type HistoryAction,
  type ScoreState,
} from "@/state/scoreReducer"
import { ScorePlayer } from "@/lib/audio/playback"
import type { Duration } from "@/types/score"

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
  /** Numărul din indicația de tempo notată (ex. 120 din „♩ = 120") */
  tempo: number
  /** Unitatea de bătaie a indicației de tempo notate (♩, ♪, 𝅗𝅥…) — implicit pătrimea */
  tempoBeat: Duration
  /** Dacă unitatea de bătaie a tempo-ului are punct de prelungire (ex. ♩.) */
  tempoBeatDotted: boolean
  /** Indicație liberă de tempo/expresie de pe foaie (ex. „Adagietto", „Pianissimo") */
  tempoText: string
}

interface ScoreEditorValue extends ScoreState {
  dispatch: Dispatch<HistoryAction>
  canUndo: boolean
  canRedo: boolean
  meta: ScoreMeta
  setMeta: (changes: Partial<ScoreMeta>) => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  /** Viteza de redare (%, implicit 100) — separată de tempo-ul notat; nu se
   *  salvează și nu intră în undo (reglaj de practică „pe parcurs") */
  playbackRate: number
  setPlaybackRate: (percent: number) => void
  /** Mixer per portativ (volum 0–1 + mute), pe id de portativ — reglaj de redare
   *  (nu intră în undo, nu se salvează). Lipsă = volum 1, nemutat. */
  mixer: Record<string, { volume: number; muted: boolean }>
  setStaffVolume: (staffId: string, volume: number) => void
  toggleStaffMute: (staffId: string) => void
  /** Player-ul audio partajat (folosit și de bara de transport, și de Space) —
   *  unul singur, ca redările să nu se suprapună */
  player: ScorePlayer
  /** Adevărat cât timp se redă (reactiv — pentru iconița butonului Play) */
  isPlaying: boolean
  setIsPlaying: Dispatch<SetStateAction<boolean>>
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
  const [playbackRate, setPlaybackRate] = useState(100)
  const [mixer, setMixer] = useState<Record<string, { volume: number; muted: boolean }>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  // un singur player pe toată aplicația — partajat între Play și Space
  const [player] = useState(() => new ScorePlayer())
  useEffect(() => () => player.stop(), [player])
  const [meta, setMetaState] = useState<ScoreMeta>({
    title: "",
    composer: "",
    tempo: 120,
    tempoBeat: "quarter",
    tempoBeatDotted: false,
    tempoText: "",
  })

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
        playbackRate,
        setPlaybackRate,
        mixer,
        setStaffVolume: (staffId, volume) =>
          setMixer((m) => ({ ...m, [staffId]: { volume, muted: m[staffId]?.muted ?? false } })),
        toggleStaffMute: (staffId) =>
          setMixer((m) => ({
            ...m,
            [staffId]: { volume: m[staffId]?.volume ?? 1, muted: !(m[staffId]?.muted ?? false) },
          })),
        player,
        isPlaying,
        setIsPlaying,
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
