import { useScoreEditor } from "@/state/scoreEditorContext"
import { KEY_SIGNATURES } from "@/lib/notation/keySignature"
import { CLEF_OPTIONS } from "@/lib/notation/instrument"
import { supportsTab } from "@/lib/notation/tab"
import { TIME_SIGNATURES, timeSignatureLabel } from "@/lib/notation/timeSignature"
import { Select } from "@/components/ui/select"
import type { Clef, StaffDisplay } from "@/types/score"

const DISPLAY_OPTIONS: { value: StaffDisplay; label: string }[] = [
  { value: "notation", label: "Notație" },
  { value: "tab", label: "TAB" },
  { value: "both", label: "Ambele" },
]

/**
 * Controale de semnătură. Cheia (clef) și tonalitatea (armura) se aplică
 * portativului ACTIV (fiecare instrument poate avea ale lui — ex. cele
 * transpozitorii). Măsura rămâne comună întregii partituri, ca barele să
 * rămână aliniate vertical.
 */
export function SignatureControls() {
  const { staves, activeStaffId, timeSignature, dispatch } = useScoreEditor()
  const activeStaff = staves.find((s) => s.id === activeStaffId) ?? staves[0]

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        Cheie
        <Select
          aria-label="Cheia portativului activ"
          value={activeStaff.clef}
          onChange={(v) => dispatch({ type: "setClef", clef: v as Clef })}
          options={CLEF_OPTIONS.map(({ clef, label }) => ({ value: clef, label }))}
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        Tonalitate
        <Select
          aria-label="Tonalitatea (armura) portativului activ"
          value={activeStaff.keySignature}
          onChange={(v) => dispatch({ type: "setKeySignature", keySignature: v })}
          options={KEY_SIGNATURES.map(({ spec, label }) => ({ value: spec, label }))}
        />
      </label>

      {supportsTab(activeStaff.instrument) && (
        <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
          Afișare
          <Select
            aria-label="Mod de afișare al chitarei (notație / TAB / ambele)"
            value={activeStaff.display ?? "notation"}
            onChange={(v) =>
              dispatch({ type: "setStaffDisplay", staffId: activeStaff.id, display: v as StaffDisplay })
            }
            options={DISPLAY_OPTIONS}
          />
        </label>
      )}

      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        Măsură <span className="opacity-60">(toate)</span>
        <Select
          aria-label="Indicația de măsură (comună)"
          value={timeSignatureLabel(timeSignature)}
          onChange={(v) => {
            const next = TIME_SIGNATURES.find((ts) => timeSignatureLabel(ts) === v)
            if (next) dispatch({ type: "setTimeSignature", timeSignature: next })
          }}
          options={TIME_SIGNATURES.map((ts) => {
            const label = timeSignatureLabel(ts)
            return { value: label, label }
          })}
        />
      </label>
    </div>
  )
}
