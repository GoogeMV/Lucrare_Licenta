import { useState } from "react"
import { InteractiveStave } from "@/components/notation/InteractiveStave"
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
function SheetHeading() {
  const { meta, setMeta } = useScoreEditor()

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
          (ca în partiturile tipărite); legată de slider-ul din bara de jos */}
      <div className="flex items-center gap-1 text-sm text-foreground">
        <span>♩ =</span>
        <input
          type="number"
          min={40}
          max={240}
          value={meta.tempo}
          onChange={(e) => {
            const value = Number(e.target.value)
            if (Number.isFinite(value)) setMeta({ tempo: Math.max(40, Math.min(240, value)) })
          }}
          aria-label="Tempo (pătrimi pe minut)"
          className="w-14 bg-transparent tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
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
    <main className="flex flex-1 flex-col overflow-auto bg-background">
      <div className="flex items-start justify-between gap-4 px-6 pt-4">
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
            "w-full max-w-4xl rounded-md border border-border/60 bg-surface/60 px-8 py-7 shadow-2xl shadow-black/40 transition-shadow",
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
