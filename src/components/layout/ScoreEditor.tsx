import { useEffect, useRef, useState } from "react"
import { InteractiveStave } from "@/components/notation/InteractiveStave"
import { NoteValueIcon } from "@/components/notation/NoteValueIcon"
import { DURATION_LABELS, TEMPO_BEAT_CHOICES } from "@/lib/notation/duration"
import { SignatureControls } from "@/components/layout/SignatureControls"
import { StaffList } from "@/components/layout/StaffList"
import { INSTRUMENT_DRAG_TYPE } from "@/components/layout/InstrumentPalette"
import { cn } from "@/lib/utils"
import { useScoreEditor } from "@/state/scoreEditorContext"

/**
 * Antetul "foii": titlul (centrat) și compozitorul (dreapta), editabile direct
 * — input-uri transparente care arată ca text tipărit, ca în MuseScore.
 * (Scurtăturile de tastatură ale portativului ignoră tastele din input-uri.)
 */
/**
 * Selector pentru unitatea de bătaie a tempo-ului (♩, ♪, 𝅗𝅥, variante cu punct).
 * Dropdown propriu pe `<details>` — `<select>`-ul nativ acceptă doar text, dar
 * noi vrem iconițe SVG (vezi NoteValueIcon — simbolurile muzicale Unicode au
 * coada detașată). Se închide la alegere și la click în afară.
 */
function TempoBeatPicker() {
  const { meta, setMeta } = useScoreEditor()
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = ref.current
      if (el?.open && !el.contains(e.target as Node)) el.open = false
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  return (
    <details ref={ref} className="relative">
      <summary
        title="Unitatea de bătaie a tempo-ului"
        aria-label="Unitatea de bătaie a tempo-ului"
        className="flex cursor-pointer list-none items-center rounded px-1 py-0.5 hover:bg-surface-hover [&::-webkit-details-marker]:hidden"
      >
        <NoteValueIcon duration={meta.tempoBeat} dotted={meta.tempoBeatDotted} className="text-lg" />
      </summary>
      {/* coloane cu lățime FIXĂ (nu 1fr): popoverul se strânge la conținut, iar
          1fr ar colapsa coloanele la 0 și ar suprapune iconițele */}
      <div className="absolute left-0 top-full z-20 mt-1 grid grid-cols-[repeat(4,2.25rem)] gap-1 rounded-md border border-border bg-surface p-1.5 shadow-xl">
        {TEMPO_BEAT_CHOICES.map(({ duration, dotted }) => {
          const active = duration === meta.tempoBeat && dotted === meta.tempoBeatDotted
          return (
            <button
              key={`${duration}-${dotted}`}
              type="button"
              title={`${DURATION_LABELS[duration]}${dotted ? " cu punct" : ""}`}
              onClick={() => {
                setMeta({ tempoBeat: duration, tempoBeatDotted: dotted })
                if (ref.current) ref.current.open = false
              }}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded border text-base transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-hover text-foreground hover:border-primary/60 hover:text-primary",
              )}
            >
              <NoteValueIcon duration={duration} dotted={dotted} />
            </button>
          )
        })}
      </div>
    </details>
  )
}

function SheetHeading() {
  const { meta, setMeta } = useScoreEditor()
  // input-ul de tempo are stare proprie de TEXT, ca să poți tasta liber (inclusiv
  // gol temporar sau zecimale) fără să sară: fără clamp și fără rotunjire — singura
  // condiție e să fie un număr > 0 (altfel redarea ar împărți la zero)
  const [tempoInput, setTempoInput] = useState(String(meta.tempo))
  // resincronizăm dacă tempo-ul se schimbă din altă parte (încărcare/import
  // partitură); funcția imbricată evită regula react-hooks/set-state-in-effect
  useEffect(() => {
    const sync = () => setTempoInput(String(meta.tempo))
    sync()
  }, [meta.tempo])

  return (
    <div className="mb-2 flex flex-col gap-1">
      <input
        type="text"
        value={meta.title}
        onChange={(e) => setMeta({ title: e.target.value })}
        placeholder="Partitură fără titlu"
        aria-label="Titlul partiturii"
        className="w-full bg-transparent text-center font-heading text-2xl font-semibold text-foreground outline-none placeholder:text-foreground-muted/40 focus:placeholder:text-foreground-muted/20"
      />
      <input
        type="text"
        value={meta.composer}
        onChange={(e) => setMeta({ composer: e.target.value })}
        placeholder="Compozitor"
        aria-label="Compozitorul partiturii"
        className="w-full bg-transparent text-right text-sm italic text-foreground-muted outline-none placeholder:text-foreground-muted/40 focus:placeholder:text-foreground-muted/20"
      />
      {/* indicația de tempo — pe foaie, în stânga, deasupra primei măsuri
          (ca în partiturile tipărite); legată de slider-ul din bara de jos.
          În stânga, o indicație liberă de tempo/expresie editabilă
          (ex. „Adagietto", „Pianissimo"), ca în MuseScore. */}
      <div className="flex items-center gap-3 text-sm text-foreground">
        <input
          type="text"
          value={meta.tempoText}
          onChange={(e) => setMeta({ tempoText: e.target.value })}
          placeholder="Indicație (ex. Adagietto, Pianissimo)"
          aria-label="Indicație de tempo / expresie"
          className="w-64 bg-transparent font-medium italic outline-none placeholder:not-italic placeholder:text-foreground-muted/40 focus:placeholder:text-foreground-muted/20"
        />
        <span className="flex items-center gap-1">
          {/* unitatea de bătaie a indicației de tempo (♩, ♪, 𝅗𝅥…) — alegerea
              compozitorului; nu afectează viteza de redare */}
          <TempoBeatPicker />
          <span>=</span>
          <input
            type="number"
            min={1}
            step="any"
            value={tempoInput}
            onChange={(e) => {
              setTempoInput(e.target.value)
              const value = Number(e.target.value)
              // actualizăm tempo-ul doar pentru valori valide >0; gol/invalid rămâne
              // doar în câmp până la blur (nu forțăm o valoare în timp ce tastezi)
              if (Number.isFinite(value) && value > 0) setMeta({ tempo: value })
            }}
            onBlur={() => {
              // dacă a rămas gol sau invalid, readucem afișajul la tempo-ul curent
              const value = Number(tempoInput)
              if (!Number.isFinite(value) || value <= 0) setTempoInput(String(meta.tempo))
            }}
            aria-label="Numărul indicației de tempo"
            className="w-14 bg-transparent tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </span>
      </div>
    </div>
  )
}

/**
 * Zona centrală: "foaia" partiturii — titlu + compozitor deasupra portativului
 * interactiv, pe un fundal care emulează o pagină tipărită. Deasupra foii:
 * lista portativelor (stânga) și controalele de semnătură (dreapta).
 */
export function ScoreEditor() {
  const { dispatch } = useScoreEditor()
  // adevărat cât timp un instrument din paletă e tras deasupra foii
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <main className="desk-wood flex flex-1 flex-col overflow-auto bg-background">
      <div className="frame flex items-start justify-between gap-4 px-6 pt-4">
        <StaffList />
        <SignatureControls />
      </div>

      <div className="flex flex-1 flex-col items-center p-6">
        <div
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(INSTRUMENT_DRAG_TYPE)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            const instrument = e.dataTransfer.getData(INSTRUMENT_DRAG_TYPE)
            setIsDragOver(false)
            if (!instrument) return
            e.preventDefault()
            dispatch({ type: "addStaff", instrument })
          }}
          className={cn(
            "score-sheet w-full max-w-4xl rounded-md border border-border/60 px-8 py-7 shadow-2xl shadow-black/40 transition-shadow",
            isDragOver && "border-primary ring-2 ring-primary/60",
          )}
        >
          <SheetHeading />
          <InteractiveStave />
        </div>
      </div>
    </main>
  )
}
