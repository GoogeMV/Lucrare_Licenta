import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useScoreEditor } from "@/state/scoreEditorContext"
import {
  DURATION_HOTKEY_LABELS,
  DURATION_LABELS,
  DURATION_SYMBOLS,
  DURATIONS,
  REST_HOTKEY_LABELS,
} from "@/lib/notation/duration"
import {
  ACCIDENTAL_HOTKEY_LABELS,
  ACCIDENTAL_LABELS,
  ACCIDENTAL_SYMBOLS,
} from "@/lib/notation/accidental"
import {
  ARTICULATION_LABELS,
  ARTICULATION_SYMBOLS,
  ARTICULATIONS,
} from "@/lib/notation/articulation"
import type { Accidental, Duration } from "@/types/score"

/** Clasa de bază a unui buton din toolbar */
const TOOL_BUTTON_CLASS =
  "flex h-9 items-center justify-center rounded-md border border-border bg-surface-hover text-lg text-foreground transition-colors hover:border-primary/60 hover:text-primary"

/** Clasa pentru un buton dezactivat (cât timp nu e selectată nicio notă) */
const DISABLED_BUTTON_CLASS =
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"

const ACCIDENTALS: Accidental[] = ["flat", "sharp", "natural"]

/** Pauzele disponibile în toolbar, cu durata și tasta rapidă asociată (A/S/D) */
const REST_BUTTONS: { duration: Duration; symbol: string; label: string }[] = [
  { duration: "whole", symbol: "𝄻", label: "Pauză întreagă" },
  { duration: "half", symbol: "𝄼", label: "Pauză de doime" },
  { duration: "quarter", symbol: "𝄽", label: "Pauză de pătrime" },
]

/**
 * Grupul de pauze: fiecare buton inserează o pauză de durata respectivă imediat
 * după elementul selectat (în oglindă cu tastele rapide A/S/D de pe portativ).
 */
function RestGroup() {
  const { dispatch } = useScoreEditor()

  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium text-foreground-muted">Pauze</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {REST_BUTTONS.map(({ duration, symbol, label }) => (
          <Tooltip key={duration}>
            <TooltipTrigger
              onClick={() => dispatch({ type: "insertRest", duration })}
              className={TOOL_BUTTON_CLASS}
            >
              {symbol}
            </TooltipTrigger>
            <TooltipContent>
              {label} <span className="opacity-60">({REST_HOTKEY_LABELS[duration]})</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

/**
 * Grupul de alterații: aplică (sau elimină, dacă e deja aplicată) alterația
 * notei selectate. Inactiv cât timp nu e selectată nicio notă — în oglindă cu
 * tastele rapide [ ] \ de pe portativ.
 */
function AccidentalGroup() {
  const { selectedId, dispatch } = useScoreEditor()
  const disabled = !selectedId

  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium text-foreground-muted">Alterații</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {ACCIDENTALS.map((accidental) => (
          <Tooltip key={accidental}>
            <TooltipTrigger
              disabled={disabled}
              onClick={() => dispatch({ type: "toggleAccidental", accidental })}
              className={cn(TOOL_BUTTON_CLASS, DISABLED_BUTTON_CLASS)}
            >
              {ACCIDENTAL_SYMBOLS[accidental]}
            </TooltipTrigger>
            <TooltipContent>
              {ACCIDENTAL_LABELS[accidental]}{" "}
              <span className="opacity-60">({ACCIDENTAL_HOTKEY_LABELS[accidental]})</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

/**
 * Grupul de semne de expresie: staccato/accent/tenuto se aplică notei selectate;
 * legato (⌣) leagă nota selectată de următoarea. Inactive cât timp selecția nu
 * permite acțiunea (nicio notă selectată, respectiv nicio notă următoare).
 */
function ArticulationGroup() {
  const { staves, selectedId, dispatch } = useScoreEditor()
  const disabled = !selectedId
  // legato are nevoie de o notă selectată ȘI de una următoare în același portativ
  const staffNotes = staves.find((s) => s.notes.some((n) => n.id === selectedId))?.notes ?? []
  const selectedIndex = selectedId ? staffNotes.findIndex((n) => n.id === selectedId) : -1
  const slurDisabled = selectedIndex < 0 || selectedIndex >= staffNotes.length - 1

  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium text-foreground-muted">Semne</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {ARTICULATIONS.map((articulation) => (
          <Tooltip key={articulation}>
            <TooltipTrigger
              disabled={disabled}
              onClick={() => dispatch({ type: "toggleArticulation", articulation })}
              className={cn(TOOL_BUTTON_CLASS, DISABLED_BUTTON_CLASS)}
            >
              {ARTICULATION_SYMBOLS[articulation]}
            </TooltipTrigger>
            <TooltipContent>{ARTICULATION_LABELS[articulation]}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger
            disabled={slurDisabled}
            onClick={() => dispatch({ type: "toggleSlur" })}
            className={cn(TOOL_BUTTON_CLASS, DISABLED_BUTTON_CLASS)}
          >
            ⌣
          </TooltipTrigger>
          <TooltipContent>
            Legato <span className="opacity-60">(L)</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

/**
 * Grupul de durate este "viu": durata aleasă aici devine durata curentă de
 * input și, dacă există o intrare selectată, îi schimbă imediat durata.
 */
function DurationGroup() {
  const { selectedDuration, dispatch } = useScoreEditor()

  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium text-foreground-muted">Durate</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {DURATIONS.map((duration: Duration) => {
          const active = duration === selectedDuration
          return (
            <Tooltip key={duration}>
              <TooltipTrigger
                onClick={() => dispatch({ type: "setDuration", duration })}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md border text-lg transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-hover text-foreground hover:border-primary/60 hover:text-primary",
                )}
              >
                {DURATION_SYMBOLS[duration]}
              </TooltipTrigger>
              <TooltipContent>
                {DURATION_LABELS[duration]} <span className="opacity-60">({DURATION_HOTKEY_LABELS[duration]})</span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Panou din dreapta: durate, pauze, alterații și semne de expresie — toate
 * conectate la portativul interactiv prin starea partajată (`ScoreEditorContext`).
 */
export function NoteToolbar() {
  return (
    <aside className="flex w-52 shrink-0 flex-col gap-4 border-l border-border bg-surface p-3">
      <h2 className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
        Toolbar note
      </h2>
      <DurationGroup />
      <Separator />
      <RestGroup />
      <Separator />
      <AccidentalGroup />
      <Separator />
      <ArticulationGroup />
    </aside>
  )
}
