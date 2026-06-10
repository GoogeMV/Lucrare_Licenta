import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { BookOpen, Check, ChevronDown, MoveHorizontal, Redo2, Undo2 } from "lucide-react"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { saveScore, loadScore, hasSavedScore } from "@/lib/storage/scoreStorage"
import { scoreToMusicXML } from "@/lib/export/musicxml"

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"

/**
 * Meniul "Fișier": salvare/încărcare locală (localStorage) și partitură nouă.
 * Dropdown minimal, închis la click în afara lui.
 */
function FileMenu() {
  const { staves, timeSignature, meta, setMeta, dispatch } = useScoreEditor()
  const [open, setOpen] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // închidem meniul la click oriunde în afara lui
  useEffect(() => {
    if (!open) return
    function onMouseDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  function handleSave() {
    const ok = saveScore(staves, timeSignature, meta)
    setOpen(false)
    if (ok) {
      // feedback scurt pe buton: "✓ Salvat"
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 2000)
    }
  }

  function handleLoad() {
    const saved = loadScore()
    setOpen(false)
    if (!saved) return
    if (!window.confirm("Înlocuiești partitura curentă cu cea salvată?")) return
    dispatch({ type: "loadScore", staves: saved.staves, timeSignature: saved.timeSignature })
    setMeta({ title: saved.title ?? "", composer: saved.composer ?? "", tempo: saved.tempo ?? 120 })
  }

  function handleNew() {
    setOpen(false)
    if (!window.confirm("Începi o partitură nouă? Modificările nesalvate se pierd.")) return
    dispatch({ type: "newScore" })
    setMeta({ title: "", composer: "", tempo: 120 })
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
        {justSaved ? (
          <>
            <Check className="size-4 text-primary" /> Salvat
          </>
        ) : (
          <>
            Fișier <ChevronDown className="size-3 opacity-60" />
          </>
        )}
      </Button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border border-border bg-surface p-1 shadow-lg">
          <button type="button" className={MENU_ITEM_CLASS} onClick={handleSave}>
            Salvează partitura <span className="ml-auto text-xs opacity-50">local</span>
          </button>
          <button
            type="button"
            className={MENU_ITEM_CLASS}
            onClick={handleLoad}
            disabled={!hasSavedScore()}
          >
            Încarcă partitura salvată
          </button>
          <button type="button" className={MENU_ITEM_CLASS} onClick={handleNew}>
            Partitură nouă
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Butonul Export: descarcă partitura ca MusicXML — formatul standard de schimb,
 * care se deschide direct în MuseScore / Finale / Sibelius.
 */
function ExportButton() {
  const { staves, timeSignature, meta } = useScoreEditor()

  function handleExport() {
    const xml = scoreToMusicXML(staves, timeSignature, meta)
    const blob = new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    // numele fișierului din titlu (fără caractere problematice pentru sisteme de fișiere)
    const safeTitle = meta.title.trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 60)
    link.download = `${safeTitle || "partitura"}.musicxml`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleExport}
      title="Descarcă partitura ca MusicXML (se deschide în MuseScore)"
    >
      Export
    </Button>
  )
}

/**
 * Bara de sus a aplicației: identitatea aplicației + acțiuni globale
 * (fișier, export, vizualizare, schimbare temă, cont utilizator).
 */
export function Header() {
  const { viewMode, setViewMode, canUndo, canRedo, dispatch } = useScoreEditor()
  const isPage = viewMode === "page"

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
          NotationSoft
        </span>
      </div>

      <nav className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={!canUndo}
          onClick={() => dispatch({ type: "undo" })}
          aria-label="Anulează (Ctrl+Z)"
          title="Anulează (Ctrl+Z)"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={!canRedo}
          onClick={() => dispatch({ type: "redo" })}
          aria-label="Refă (Ctrl+Y)"
          title="Refă (Ctrl+Y)"
        >
          <Redo2 className="size-4" />
        </Button>
        <FileMenu />
        <ExportButton />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMode(isPage ? "continuous" : "page")}
          title={isPage ? "Comută la vizualizarea continuă (un singur rând)" : "Comută la vizualizarea pe pagină"}
        >
          {isPage ? <BookOpen className="size-4" /> : <MoveHorizontal className="size-4" />}
          Vizualizare: {isPage ? "Pagină" : "Continuu"}
        </Button>
        <Button variant="ghost" size="sm">
          Temă
        </Button>
      </nav>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm">
          Cont
        </Button>
      </div>
    </header>
  )
}
