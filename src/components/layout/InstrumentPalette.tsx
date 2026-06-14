import { ScrollArea } from "@/components/ui/scroll-area"
import { useScoreEditor } from "@/state/scoreEditorContext"

const INSTRUMENT_GROUPS = [
  {
    name: "Coarde",
    instruments: ["Vioară", "Violă", "Violoncel", "Contrabas"],
  },
  {
    name: "Suflători lemn",
    instruments: ["Flaut", "Oboi", "Clarinet", "Fagot"],
  },
  {
    name: "Suflători alamă",
    instruments: ["Trompetă", "Corn", "Trombon", "Tubă"],
  },
  {
    name: "Claviaturi",
    instruments: ["Pian", "Pian electric", "Orgă"],
  },
  {
    name: "Coarde ciupite",
    instruments: ["Chitară", "Chitară electrică", "Chitară clasică", "Chitară bas"],
  },
  {
    name: "Voce",
    instruments: ["Voce (cor)"],
  },
]

/** Tipul MIME folosit la drag & drop-ul instrumentelor din paletă pe partitură */
export const INSTRUMENT_DRAG_TYPE = "application/x-notationsoft-instrument"

/**
 * Panou din stânga: lista instrumentelor disponibile. Un instrument se adaugă
 * în partitură prin drag & drop peste foaie sau prin click (ambele funcționează).
 */
export function InstrumentPalette() {
  const { dispatch } = useScoreEditor()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
          Instrumente
        </h2>
        <p className="mt-1 text-[11px] leading-snug text-foreground-muted">
          Trage un instrument peste partitură (sau dă click) pentru a-l adăuga.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {INSTRUMENT_GROUPS.map((group) => (
            <div key={group.name}>
              <h3 className="mb-1 text-[11px] font-medium text-foreground-muted">
                {group.name}
              </h3>
              <ul className="flex flex-col gap-1">
                {group.instruments.map((instrument) => (
                  <li key={instrument}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(INSTRUMENT_DRAG_TYPE, instrument)
                        e.dataTransfer.effectAllowed = "copy"
                      }}
                      onClick={() => dispatch({ type: "addStaff", instrument })}
                      className="w-full cursor-grab rounded-md border border-border bg-surface-hover px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:border-primary/60 hover:text-primary active:cursor-grabbing"
                    >
                      {instrument}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
