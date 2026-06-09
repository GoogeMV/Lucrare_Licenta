import { useScoreEditor } from "@/state/scoreEditorContext"
import { KEY_SIGNATURES } from "@/lib/notation/keySignature"
import { CLEF_OPTIONS } from "@/lib/notation/instrument"
import { TIME_SIGNATURES, timeSignatureLabel } from "@/lib/notation/timeSignature"
import type { Clef } from "@/types/score"

const SELECT_CLASS =
  "h-8 rounded-md border border-border bg-surface-hover px-2 text-xs text-foreground transition-colors hover:border-primary/60 focus-visible:border-primary focus-visible:outline-none"

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
      <span className="text-xs text-foreground-muted">
        Portativ activ: <span className="text-primary">{activeStaff.instrument}</span>
      </span>

      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        Cheie
        <select
          aria-label="Cheia portativului activ"
          className={SELECT_CLASS}
          value={activeStaff.clef}
          onChange={(e) => dispatch({ type: "setClef", clef: e.target.value as Clef })}
        >
          {CLEF_OPTIONS.map(({ clef, label }) => (
            <option key={clef} value={clef}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        Tonalitate
        <select
          aria-label="Tonalitatea (armura) portativului activ"
          className={SELECT_CLASS}
          value={activeStaff.keySignature}
          onChange={(e) => dispatch({ type: "setKeySignature", keySignature: e.target.value })}
        >
          {KEY_SIGNATURES.map(({ spec, label }) => (
            <option key={spec} value={spec}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        Măsură <span className="opacity-60">(toate)</span>
        <select
          aria-label="Indicația de măsură (comună)"
          className={SELECT_CLASS}
          value={timeSignatureLabel(timeSignature)}
          onChange={(e) => {
            const next = TIME_SIGNATURES.find((ts) => timeSignatureLabel(ts) === e.target.value)
            if (next) dispatch({ type: "setTimeSignature", timeSignature: next })
          }}
        >
          {TIME_SIGNATURES.map((ts) => {
            const label = timeSignatureLabel(ts)
            return (
              <option key={label} value={label}>
                {label}
              </option>
            )
          })}
        </select>
      </label>
    </div>
  )
}
