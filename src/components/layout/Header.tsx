import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { BookOpen, Check, ChevronDown, HelpCircle, MoveHorizontal, Palette, Redo2, Undo2 } from "lucide-react"
import { TOGGLE_HELP_EVENT } from "@/components/layout/HelpOverlay"
import { AccountMenu } from "@/components/layout/AccountMenu"
import { MidiButton } from "@/components/layout/MidiButton"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { saveScore, loadScore, hasSavedScore } from "@/lib/storage/scoreStorage"
import { scoreToMusicXML } from "@/lib/export/musicxml"
import { parseMusicXML } from "@/lib/import/musicxml"
import { renderScoreToWav } from "@/lib/audio/wavExport"
import { entryBeats, playbackQuarterBpm } from "@/lib/notation/duration"
import { splitIntoMeasures } from "@/lib/notation/measure"
import { measureQuarters } from "@/lib/notation/timeSignature"
import { instrumentLabel } from "@/lib/notation/instrument"
import type { Clef, Staff, TimeSignature } from "@/types/score"

const CLEF_RO: Record<Clef, string> = { treble: "cheie sol", bass: "cheie fa", alto: "cheie do" }

/**
 * Construiește portativele de exportat: păstrează doar instrumentele bifate și,
 * dacă intervalul de măsuri nu e complet, doar notele care ÎNCEP în interval
 * (legăturile către note tăiate se elimină). Folosit identic la MusicXML și WAV.
 */
function buildExportStaves(
  staves: Staff[],
  timeSignature: TimeSignature,
  includedIds: Set<string>,
  fromMeasure: number,
  toMeasure: number,
  totalMeasures: number,
): Staff[] {
  const chosen = staves.filter((s) => includedIds.has(s.id))
  if (fromMeasure <= 1 && toMeasure >= totalMeasures) return chosen
  const beatsPerMeasure = measureQuarters(timeSignature)
  const startBeat = (fromMeasure - 1) * beatsPerMeasure
  const endBeat = toMeasure * beatsPerMeasure
  return chosen.map((staff) => {
    const kept = []
    let beat = 0
    for (const note of staff.notes) {
      if (beat >= startBeat - 1e-6 && beat < endBeat - 1e-6) kept.push(note)
      beat += entryBeats(note)
    }
    const keptIds = new Set(kept.map((n) => n.id))
    return { ...staff, notes: kept, slurs: staff.slurs.filter((sl) => keptIds.has(sl.fromId) && keptIds.has(sl.toId)) }
  })
}

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"

/**
 * Meniul "Fișier": salvare/încărcare locală (localStorage) și partitură nouă.
 * Dropdown minimal, închis la click în afara lui.
 */
function FileMenu() {
  const { staves, timeSignature, meta, setMeta, dispatch, setCurrentScoreId } = useScoreEditor()
  const [open, setOpen] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setMeta({
      title: saved.title ?? "",
      composer: saved.composer ?? "",
      tempo: saved.tempo ?? 120,
      tempoBeat: saved.tempoBeat ?? "quarter",
      tempoBeatDotted: saved.tempoBeatDotted ?? false,
      tempoText: saved.tempoText ?? "",
    })
    setCurrentScoreId(null) // partitură locală, nu mai edităm cea din cloud
  }

  function handleNew() {
    setOpen(false)
    if (!window.confirm("Începi o partitură nouă? Modificările nesalvate se pierd.")) return
    dispatch({ type: "newScore" })
    setMeta({ title: "", composer: "", tempo: 120, tempoBeat: "quarter", tempoBeatDotted: false, tempoText: "" })
    setCurrentScoreId(null)
  }

  function handleImportClick() {
    setOpen(false)
    fileInputRef.current?.click()
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = "" // permite reimportul aceluiași fișier
    if (!file) return
    try {
      const imported = parseMusicXML(await file.text())
      if (!window.confirm("Înlocuiești partitura curentă cu fișierul importat?")) return
      dispatch({ type: "loadScore", staves: imported.staves, timeSignature: imported.timeSignature })
      setMeta(imported.meta)
      setCurrentScoreId(null) // import = partitură nouă, nu cea din cloud
    } catch (error) {
      window.alert(`Importul a eșuat: ${error instanceof Error ? error.message : "fișier nevalid"}`)
    }
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
        <div className="menu-light absolute top-full left-0 z-50 mt-1 w-56 rounded-md border border-border bg-surface p-1 shadow-lg">
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
          <button type="button" className={MENU_ITEM_CLASS} onClick={handleImportClick}>
            Importă MusicXML <span className="ml-auto text-xs opacity-50">.musicxml</span>
          </button>
          <button type="button" className={MENU_ITEM_CLASS} onClick={handleNew}>
            Partitură nouă
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".musicxml,.xml,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  )
}

/**
 * Meniul Export: alegi CE instrumente și (opțional) ce interval de măsuri
 * exporți, apoi formatul — MusicXML (schimb cu MuseScore/Finale/Sibelius) sau
 * audio WAV (randat offline). Implicit: instrumentele bifate pentru redare
 * parțială (Ctrl+click), altfel toate; intervalul de măsuri întreg.
 */
function ExportMenu() {
  const { staves, timeSignature, meta, selectedStaffIds, mixer, theme, setTheme, viewMode, setViewMode } =
    useScoreEditor()
  const [open, setOpen] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [included, setIncluded] = useState<Set<string>>(new Set())
  const [fromMeasure, setFromMeasure] = useState(1)
  const [toMeasure, setToMeasure] = useState(1)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const totalMeasures = useMemo(() => {
    const beatsPerMeasure = measureQuarters(timeSignature)
    return Math.max(1, ...staves.map((s) => splitIntoMeasures(s.notes, beatsPerMeasure).length))
  }, [staves, timeSignature])

  useEffect(() => {
    if (!open) return
    function onMouseDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  // la deschidere, pornim de la instrumentele bifate (sau toate) și intervalul întreg
  function openMenu() {
    const defaults = selectedStaffIds.length ? selectedStaffIds : staves.map((s) => s.id)
    setIncluded(new Set(defaults))
    setFromMeasure(1)
    setToMeasure(totalMeasures)
    setOpen(true)
  }

  function toggleStaff(id: string) {
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function fileBase() {
    return meta.title.trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "partitura"
  }
  function download(blob: Blob, extension: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${fileBase()}.${extension}`
    link.click()
    URL.revokeObjectURL(url)
  }

  // portativele de exportat după selecția curentă (instrumente + interval măsuri)
  function exportStaves(): Staff[] | null {
    const from = Math.max(1, Math.min(fromMeasure, toMeasure))
    const to = Math.min(totalMeasures, Math.max(fromMeasure, toMeasure))
    const result = buildExportStaves(staves, timeSignature, included, from, to, totalMeasures)
    if (result.length === 0) {
      window.alert("Selectează cel puțin un instrument pentru export.")
      return null
    }
    return result
  }

  function handleExportXml() {
    const chosen = exportStaves()
    if (!chosen) return
    setOpen(false)
    const xml = scoreToMusicXML(chosen, timeSignature, meta)
    download(new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" }), "musicxml")
  }

  // PDF prin dialogul de print al browserului (Salvează ca PDF, A4): forțăm tema
  // deschisă (negru pe alb), izolăm foaia prin CSS de print, apoi revenim la temă.
  function handleExportPdf() {
    setOpen(false)
    const restoreTheme = theme
    const restoreView = viewMode
    // tema deschisă (negru pe alb) + vizualizare pe PAGINĂ (fără derulare orizontală)
    if (theme !== "light") setTheme("light")
    if (viewMode !== "page") setViewMode("page")
    document.body.classList.add("printing")
    const onAfterPrint = () => {
      document.body.classList.remove("printing")
      if (restoreTheme !== "light") setTheme(restoreTheme)
      if (restoreView !== "page") setViewMode(restoreView)
      window.removeEventListener("afterprint", onAfterPrint)
    }
    window.addEventListener("afterprint", onAfterPrint)
    // lăsăm foaia să se redeseneze (temă + pagină) înainte de dialogul de print
    window.setTimeout(() => window.print(), 280)
  }

  async function handleExportWav() {
    const chosen = exportStaves()
    if (!chosen || isRendering) return
    setOpen(false)
    const parts = chosen.map((s) => ({
      notes: s.notes,
      keySignature: s.keySignature,
      instrument: s.instrument,
      volume: mixer[s.id]?.volume ?? 1,
      muted: mixer[s.id]?.muted ?? false,
    }))
    // randăm la tempo-ul NOTAT (viteza de redare e doar reglaj de practică)
    const bpm = playbackQuarterBpm(meta.tempo, meta.tempoBeat, meta.tempoBeatDotted, 100)
    setIsRendering(true)
    try {
      download(await renderScoreToWav(parts, bpm), "wav")
    } catch (error) {
      window.alert(`Exportul WAV a eșuat: ${error instanceof Error ? error.message : "eroare"}`)
    } finally {
      setIsRendering(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Button variant="ghost" size="sm" onClick={() => (open ? setOpen(false) : openMenu())} disabled={isRendering}>
        {isRendering ? "Se randează…" : <>Export <ChevronDown className="size-3 opacity-60" /></>}
      </Button>
      {open && (
        <div className="menu-light absolute top-full left-0 z-50 mt-1 w-64 rounded-md border border-border bg-surface p-2 shadow-lg">
          <p className="px-1 pb-1 text-[11px] font-medium text-foreground-muted">Instrumente</p>
          <div className="max-h-48 overflow-y-auto">
            {staves.map((staff) => (
              <label
                key={staff.id}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-surface-hover"
              >
                <input
                  type="checkbox"
                  checked={included.has(staff.id)}
                  onChange={() => toggleStaff(staff.id)}
                  className="accent-primary"
                />
                <span className="truncate">
                  {instrumentLabel(staff.instrument)}
                  {staff.groupId && <span className="text-foreground-muted"> ({CLEF_RO[staff.clef]})</span>}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-1 flex items-center gap-1.5 border-t border-border px-1 pt-2 text-xs text-foreground-muted">
            <span>Măsuri</span>
            <input
              type="number"
              min={1}
              max={totalMeasures}
              value={fromMeasure}
              onChange={(e) => setFromMeasure(Number(e.target.value) || 1)}
              className="w-12 rounded-sm border border-border bg-surface-hover px-1 py-0.5 text-center text-foreground"
            />
            <span>–</span>
            <input
              type="number"
              min={1}
              max={totalMeasures}
              value={toMeasure}
              onChange={(e) => setToMeasure(Number(e.target.value) || totalMeasures)}
              className="w-12 rounded-sm border border-border bg-surface-hover px-1 py-0.5 text-center text-foreground"
            />
            <span className="ml-auto opacity-60">din {totalMeasures}</span>
          </div>

          <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
            <button
              type="button"
              onClick={handleExportXml}
              className="flex-1 rounded-md border border-border bg-surface-hover px-2 py-1.5 text-xs text-foreground transition-colors hover:border-primary/60 hover:text-primary"
            >
              MusicXML
            </button>
            <button
              type="button"
              onClick={handleExportWav}
              className="flex-1 rounded-md border border-border bg-surface-hover px-2 py-1.5 text-xs text-foreground transition-colors hover:border-primary/60 hover:text-primary"
            >
              Audio WAV
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPdf}
            className="mt-1.5 w-full rounded-md border border-border bg-surface-hover px-2 py-1.5 text-xs text-foreground transition-colors hover:border-primary/60 hover:text-primary"
          >
            PDF <span className="opacity-50">(foaia întreagă, A4)</span>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Bara de sus a aplicației: identitatea aplicației + acțiuni globale
 * (fișier, export, vizualizare, schimbare temă, cont utilizator).
 */
export function Header() {
  const { viewMode, setViewMode, theme, toggleTheme, canUndo, canRedo, dispatch } = useScoreEditor()
  const isPage = viewMode === "page"
  const THEME_LABELS: Record<typeof theme, string> = {
    dark: "Întunecată",
    light: "Deschisă",
    "signature-dark": "Signature Dark",
    "signature-light": "Signature Light",
  }

  return (
    <header className="frame bar-cream flex h-14 shrink-0 items-center justify-between border-b border-border bg-bar px-4">
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
        <ExportMenu />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMode(isPage ? "continuous" : "page")}
          title={isPage ? "Comută la vizualizarea continuă (un singur rând)" : "Comută la vizualizarea pe pagină"}
        >
          {isPage ? <BookOpen className="size-4" /> : <MoveHorizontal className="size-4" />}
          Vizualizare: {isPage ? "Pagină" : "Continuu"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          title="Schimbă tema (Întunecată → Deschisă → Signature)"
        >
          <Palette className="size-4" />
          Temă: {THEME_LABELS[theme]}
        </Button>
        <MidiButton />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.dispatchEvent(new Event(TOGGLE_HELP_EVENT))}
          aria-label="Ajutor — taste și moduri (H)"
          title="Ajutor — taste și moduri (H)"
        >
          <HelpCircle className="size-4" />
        </Button>
      </nav>

      <div className="flex items-center gap-2">
        <AccountMenu />
      </div>
    </header>
  )
}
