import { InteractiveStave } from "@/components/notation/InteractiveStave"
import { SignatureControls } from "@/components/layout/SignatureControls"
import { StaffList } from "@/components/layout/StaffList"

/**
 * Zona centrală: portativul interactiv (randat cu VexFlow), unde notele
 * pot fi adăugate prin click și editate din tastatură (vezi InteractiveStave).
 */
export function ScoreEditor() {
  return (
    <main className="flex flex-1 flex-col overflow-auto bg-background">
      <div className="flex items-center justify-between gap-4 px-6 pt-4 text-foreground-muted">
        <div>
          <h1 className="font-heading text-base font-medium text-foreground">
            Partitură fără titlu
          </h1>
          <p className="text-xs">Click / tastatură pentru a introduce note · Fullscreen disponibil</p>
        </div>
        <SignatureControls />
      </div>

      <div className="flex flex-1 flex-col items-center gap-3 p-6">
        <div className="w-full max-w-4xl">
          <StaffList />
        </div>
        <div className="w-full max-w-4xl rounded-lg border border-border/60 bg-surface/30 p-4">
          <InteractiveStave />
        </div>
      </div>
    </main>
  )
}
