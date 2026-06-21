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

/**
 * Tema vizuală (4 opțiuni — pereche curat/decorativ pe fiecare luminozitate):
 *  - „dark" — întunecată clasică (tonuri de negru, accent argintiu);
 *  - „light" — curată stil iOS (alb/gri, accent auriu), bună pentru print;
 *  - „signature-dark" — decorativă întunecată (burgundy/crem/auriu);
 *  - „signature-light" — decorativă deschisă (ramă verde, pergament, lemn).
 */
export type Theme = "dark" | "light" | "signature-dark" | "signature-light"

const THEME_CYCLE: Theme[] = ["dark", "light", "signature-dark", "signature-light"]

/** Aplică tema prin clase pe <html>. Temele „dark" și „signature-dark" au amândouă
 *  clasa .dark (pentru variantele shadcn `dark:`); signature-* adaugă clasa proprie. */
function applyThemeClass(theme: Theme) {
  const el = document.documentElement
  el.classList.remove("dark", "signature-dark", "signature-light")
  if (theme === "dark") el.classList.add("dark")
  else if (theme === "signature-dark") el.classList.add("dark", "signature-dark")
  else if (theme === "signature-light") el.classList.add("signature-light")
  // „light" → nicio clasă (tokenii din :root)
}

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
  /** Tema curentă + comutator (ciclează) + setare directă (folosită la export PDF) */
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
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
  /** Id-ul partiturii din cloud pe care o EDITĂM acum (dacă există) — ca salvarea
   *  în cont și autosave-ul s-o ACTUALIZEZE, nu să creeze duplicate. `null` =
   *  partitură nouă/locală. Tranzitoriu (nu se salvează, nu intră în undo). */
  currentScoreId: number | null
  setCurrentScoreId: (id: number | null) => void
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
  // tema: implicit dark (ca în <html class="dark">), suprascrisă din localStorage
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("notationsoft-theme") : null
    return saved === "light" || saved === "signature-light" || saved === "signature-dark" || saved === "dark"
      ? saved
      : "dark"
  })
  // aplicăm/persistăm tema; clasele de pe <html> comută tokenii din index.css
  useEffect(() => {
    applyThemeClass(theme)
    try {
      localStorage.setItem("notationsoft-theme", theme)
    } catch {
      /* localStorage indisponibil — ignorăm */
    }
  }, [theme])
  function setTheme(next: Theme) {
    // comutăm clasa SINCRON, ca redesenarea foii (InteractiveStave) să citească
    // imediat culorile noi (--ink / --ink-accent) la următoarea randare
    applyThemeClass(next)
    setThemeState(next)
  }
  function toggleTheme() {
    setTheme(THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length])
  }
  const [mixer, setMixer] = useState<Record<string, { volume: number; muted: boolean }>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentScoreId, setCurrentScoreId] = useState<number | null>(null)
  // un singur player pe toată aplicația — partajat între Play și Space
  const [player] = useState(() => new ScorePlayer())
  useEffect(() => () => player.stop(), [player])
  const [meta, setMetaState] = useState<ScoreMeta>({
    title: "Oda Bucuriei",
    composer: "Ludwig van Beethoven",
    tempo: 120,
    tempoBeat: "quarter",
    tempoBeatDotted: false,
    tempoText: "Allegro",
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
        theme,
        toggleTheme,
        setTheme,
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
        currentScoreId,
        setCurrentScoreId,
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
