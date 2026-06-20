import { TooltipProvider } from "@/components/ui/tooltip"
import { Header } from "@/components/layout/Header"
import { InstrumentPalette } from "@/components/layout/InstrumentPalette"
import { ScoreEditor } from "@/components/layout/ScoreEditor"
import { NoteToolbar } from "@/components/layout/NoteToolbar"
import { TransportBar } from "@/components/layout/TransportBar"
import { HelpOverlay } from "@/components/layout/HelpOverlay"
import { AutoSave } from "@/components/layout/AutoSave"
import { LoginPage } from "@/components/layout/LoginPage"
import { ScoreEditorProvider } from "@/state/scoreEditorContext"
import { AuthProvider, useAuth } from "@/state/authContext"

/** Editorul propriu-zis — montat doar pentru utilizatorii autentificați. */
function EditorApp() {
  return (
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
        <AutoSave />
      </div>
    </ScoreEditorProvider>
  )
}

/**
 * Gate de autentificare: cât timp se validează tokenul salvat → ecran de
 * încărcare; nelogat → pagina de login; logat → editorul. Aplicația e acum o
 * platformă cu cont obligatoriu (cerința coordonatorului).
 */
function AuthGate() {
  const { user, ready, guest } = useAuth()
  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-foreground-muted">
        Se încarcă…
      </div>
    )
  }
  // logat SAU „continuă deconectat" → editorul; altfel pagina de login
  return user || guest ? <EditorApp /> : <LoginPage />
}

function App() {
  return (
    <TooltipProvider delay={200}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </TooltipProvider>
  )
}

export default App
