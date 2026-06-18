import { TooltipProvider } from "@/components/ui/tooltip"
import { Header } from "@/components/layout/Header"
import { InstrumentPalette } from "@/components/layout/InstrumentPalette"
import { ScoreEditor } from "@/components/layout/ScoreEditor"
import { NoteToolbar } from "@/components/layout/NoteToolbar"
import { TransportBar } from "@/components/layout/TransportBar"
import { HelpOverlay } from "@/components/layout/HelpOverlay"
import { ScoreEditorProvider } from "@/state/scoreEditorContext"
import { AuthProvider } from "@/state/authContext"

function App() {
  return (
    <TooltipProvider delay={200}>
      <AuthProvider>
      <ScoreEditorProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <InstrumentPalette />
            <ScoreEditor />
            <NoteToolbar />
          </div>
          <TransportBar />
          <HelpOverlay />
        </div>
      </ScoreEditorProvider>
      </AuthProvider>
    </TooltipProvider>
  )
}

export default App
