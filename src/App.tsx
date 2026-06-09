import { TooltipProvider } from "@/components/ui/tooltip"
import { Header } from "@/components/layout/Header"
import { InstrumentPalette } from "@/components/layout/InstrumentPalette"
import { ScoreEditor } from "@/components/layout/ScoreEditor"
import { NoteToolbar } from "@/components/layout/NoteToolbar"
import { TransportBar } from "@/components/layout/TransportBar"
import { ScoreEditorProvider } from "@/state/scoreEditorContext"

function App() {
  return (
    <TooltipProvider delay={200}>
      <ScoreEditorProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <InstrumentPalette />
            <ScoreEditor />
            <NoteToolbar />
          </div>
          <TransportBar />
        </div>
      </ScoreEditorProvider>
    </TooltipProvider>
  )
}

export default App
