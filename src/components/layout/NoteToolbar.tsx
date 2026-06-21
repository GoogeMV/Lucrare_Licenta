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
  DURATIONS,
  entryBeats,
} from "@/lib/notation/duration"
import { measureQuarters } from "@/lib/notation/timeSignature"
import { NoteValueIcon } from "@/components/notation/NoteValueIcon"
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
import { DYNAMIC_LABELS, DYNAMICS } from "@/lib/notation/dynamics"
import type { Accidental, BarType, Duration } from "@/types/score"

/** Clasa de bază a unui buton din toolbar */
const TOOL_BUTTON_CLASS =
  "flex h-9 items-center justify-center rounded-md border border-border bg-surface-hover text-lg text-foreground transition-colors hover:border-primary/60 hover:text-primary"

/** Clasa pentru un buton dezactivat (cât timp nu e selectată nicio notă) */
const DISABLED_BUTTON_CLASS =
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"

const ACCIDENTALS: Accidental[] = ["flat", "sharp", "natural"]

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
 * Grupul de nuanțe (dinamici): plasează p/mf/f… pe nota selectată (sau pe tot
 * intervalul selectat). Nuanța rămâne în vigoare la redare până la următoarea.
 * Butonul nuanței deja aplicate apare activ și, reapăsat, o elimină.
 */
function DynamicsGroup() {
  const { staves, selectedId, selectedIds, dispatch } = useScoreEditor()
  const disabled = !selectedId
  // nuanța capului de selecție — pentru evidențierea butonului activ
  const selectedEntry = staves
    .find((s) => s.notes.some((n) => n.id === selectedId))
    ?.notes.find((n) => n.id === selectedId)
  // activă doar dacă toate notele selectate au aceeași nuanță (selecție omogenă)
  const activeDynamic =
    selectedIds.length <= 1 ? selectedEntry?.dynamic : undefined

  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium text-foreground-muted">Nuanțe</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {DYNAMICS.map((dynamic) => {
          const active = dynamic === activeDynamic
          return (
            <Tooltip key={dynamic}>
              <TooltipTrigger
                disabled={disabled}
                onClick={() => dispatch({ type: "setDynamic", dynamic })}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md border text-base italic transition-colors",
                  active
                    ? "border-primary bg-primary font-bold text-primary-foreground"
                    : "border-border bg-surface-hover font-bold text-foreground hover:border-primary/60 hover:text-primary",
                  DISABLED_BUTTON_CLASS,
                )}
              >
                {dynamic}
              </TooltipTrigger>
              <TooltipContent>{DYNAMIC_LABELS[dynamic]}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

const BAR_OPTIONS: { type: BarType; symbol: string; label: string }[] = [
  { type: "repeat-begin", symbol: "𝄆", label: "Început repetiție" },
  { type: "repeat-end", symbol: "𝄇", label: "Sfârșit repetiție" },
  { type: "double", symbol: "𝄁", label: "Bară dublă" },
  { type: "final", symbol: "𝄂", label: "Bară finală" },
]

/**
 * Grupul de bare: atașează măsurii notei selectate o bară specială (repetiție,
 * bară dublă/finală). Reapăsarea aceluiași tip o elimină. Repetițiile se aud la
 * redarea întregii piese (secțiunea se redă de două ori).
 */
function BarlineGroup() {
  const { staves, selectedId, timeSignature, barlines, repeatCounts, dispatch } = useScoreEditor()
  const disabled = !selectedId

  // măsura notei selectate — pentru evidențierea barei active și numărul de repetări
  let measureIndex: number | null = null
  if (selectedId) {
    const staff = staves.find((s) => s.notes.some((n) => n.id === selectedId))
    if (staff) {
      const beatsPerMeasure = measureQuarters(timeSignature)
      let beat = 0
      for (const n of staff.notes) {
        if (n.id === selectedId) {
          measureIndex = Math.floor(beat / beatsPerMeasure + 1e-9)
          break
        }
        beat += entryBeats(n)
      }
    }
  }
  const activeBar = measureIndex !== null ? barlines[measureIndex] : undefined
  const repeatTimes = measureIndex !== null ? repeatCounts[measureIndex] ?? 2 : 2

  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium text-foreground-muted">Bare</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {BAR_OPTIONS.map(({ type, symbol, label }) => {
          const active = type === activeBar
          return (
            <Tooltip key={type}>
              <TooltipTrigger
                disabled={disabled}
                onClick={() => dispatch({ type: "setBarline", barType: type })}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md border text-lg transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-hover text-foreground hover:border-primary/60 hover:text-primary",
                  DISABLED_BUTTON_CLASS,
                )}
              >
                {symbol}
              </TooltipTrigger>
              <TooltipContent>{label} — pe măsura notei selectate</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* numărul de repetări — doar dacă măsura selectată are bară de sfârșit repetiție */}
      {activeBar === "repeat-end" && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-xs text-foreground-muted">Se repetă</span>
          <button
            type="button"
            onClick={() => dispatch({ type: "setRepeatCount", times: repeatTimes - 1 })}
            disabled={repeatTimes <= 2}
            className={cn(TOOL_BUTTON_CLASS, DISABLED_BUTTON_CLASS, "h-7 w-7 text-base")}
          >
            −
          </button>
          <span className="w-8 text-center text-sm tabular-nums text-foreground">×{repeatTimes}</span>
          <button
            type="button"
            onClick={() => dispatch({ type: "setRepeatCount", times: repeatTimes + 1 })}
            disabled={repeatTimes >= 8}
            className={cn(TOOL_BUTTON_CLASS, DISABLED_BUTTON_CLASS, "h-7 w-7 text-base")}
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Grupul de durate este "viu": durata aleasă aici devine durata curentă de
 * input și, dacă există o intrare selectată, îi schimbă imediat durata.
 */
function DurationGroup() {
  const { selectedDuration, selectedId, dispatch } = useScoreEditor()

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
                <NoteValueIcon duration={duration} />
              </TooltipTrigger>
              <TooltipContent>
                {DURATION_LABELS[duration]} <span className="opacity-60">({DURATION_HOTKEY_LABELS[duration]})</span>
              </TooltipContent>
            </Tooltip>
          )
        })}
        <Tooltip>
          <TooltipTrigger
            disabled={!selectedId}
            onClick={() => dispatch({ type: "toggleDot" })}
            className={cn(TOOL_BUTTON_CLASS, DISABLED_BUTTON_CLASS)}
          >
            ♩.
          </TooltipTrigger>
          <TooltipContent>
            Punct de prelungire — lungește nota cu 50%, punctul apare lângă cap{" "}
            <span className="opacity-60">(.)</span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            disabled={!selectedId}
            onClick={() => dispatch({ type: "makeTriplet" })}
            className={cn(TOOL_BUTTON_CLASS, DISABLED_BUTTON_CLASS, "text-base font-semibold")}
          >
            ³
          </TooltipTrigger>
          <TooltipContent>
            Triolet — împarte nota în 3 note egale în același timp{" "}
            <span className="opacity-60">(Ctrl+3)</span>
          </TooltipContent>
        </Tooltip>
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
    <aside className="frame flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-panel p-3">
      <h2 className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
        Toolbar note
      </h2>
      <DurationGroup />
      <Separator />
      <AccidentalGroup />
      <Separator />
      <ArticulationGroup />
      <Separator />
      <DynamicsGroup />
      <Separator />
      <BarlineGroup />
    </aside>
  )
}
