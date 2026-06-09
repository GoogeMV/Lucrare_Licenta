import { Volume2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useScoreEditor } from "@/state/scoreEditorContext"

const CLEF_LABELS: Record<string, string> = {
  treble: "cheie sol",
  bass: "cheie fa",
  alto: "cheie do",
}

/**
 * Lista portativelor din partitură, sub formă de "chip"-uri.
 *  - click simplu  -> face portativul activ (acolo se adaugă notele noi)
 *  - Ctrl/Cmd+click -> îl bifează/debifează pentru redare parțială
 * Butonul × șterge portativul (ultimul rămas nu poate fi șters).
 */
export function StaffList() {
  const { staves, activeStaffId, selectedStaffIds, dispatch } = useScoreEditor()
  const hasPlaybackSelection = selectedStaffIds.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {staves.map((staff) => {
          const isActive = staff.id === activeStaffId
          const inPlayback = selectedStaffIds.includes(staff.id)
          return (
            <div
              key={staff.id}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                // selecția pentru redare (Ctrl+click) — vizibilă clar: inel gros + fundal
                inPlayback
                  ? "border-primary bg-primary/25 text-primary ring-2 ring-primary"
                  : isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-hover text-foreground hover:border-primary/60",
              )}
            >
              <button
                type="button"
                onClick={(e) =>
                  e.ctrlKey || e.metaKey
                    ? dispatch({ type: "toggleStaffSelection", staffId: staff.id })
                    : dispatch({ type: "setActiveStaff", staffId: staff.id })
                }
                className="flex items-center gap-1.5"
                title={`${staff.instrument} (${CLEF_LABELS[staff.clef] ?? staff.clef}) · Ctrl+click pentru redare parțială`}
              >
                {inPlayback && <Volume2 className="size-3 text-primary" />}
                <span className="font-medium">{staff.instrument}</span>
                <span className="opacity-60">{CLEF_LABELS[staff.clef] ?? staff.clef}</span>
              </button>
              {staves.length > 1 && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "removeStaff", staffId: staff.id })}
                  aria-label={`Șterge portativul ${staff.instrument}`}
                  className="rounded-sm p-0.5 text-foreground-muted transition-colors hover:bg-surface hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-foreground-muted">
        Click = portativ activ · <span className="text-foreground">Ctrl+click</span> = selectează pentru redare parțială
        {hasPlaybackSelection
          ? ` · redă ${selectedStaffIds.length} din ${staves.length}`
          : staves.length > 1
            ? " · redă toate"
            : ""}
      </p>
    </div>
  )
}
