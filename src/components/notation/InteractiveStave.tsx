import { useCallback, useEffect, useRef } from "react"
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Articulation, Curve } from "vexflow"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { DEFAULT_PITCH } from "@/state/scoreReducer"
import { buildStaffPositions, pitchToVexflowKey, TOP_LINE_PITCH } from "@/lib/notation/pitch"
import { DURATION_BEATS, DURATION_HOTKEYS, REST_HOTKEYS, vexflowDurationCode } from "@/lib/notation/duration"
import { ACCIDENTAL_HOTKEYS, ACCIDENTAL_TO_VEXFLOW } from "@/lib/notation/accidental"
import { ARTICULATION_TO_VEXFLOW } from "@/lib/notation/articulation"
import { keyAccidentalCount } from "@/lib/notation/keySignature"
import { measureQuarters, timeSignatureLabel } from "@/lib/notation/timeSignature"
import type { Clef, Pitch } from "@/types/score"

const INK_COLOR = "#e8dcc8"
const ACCENT_COLOR = "#c9a96e"
const STAVE_GRADIENT_ID = "stave-cream-to-gold"
const SVG_NS = "http://www.w3.org/2000/svg"

/**
 * Injectează un gradient SVG (crem -> auriu) folosit pentru a colora
 * portativul (linii, cheie, armură, indicator de măsură).
 *
 * Important: liniile portativului sunt segmente perfect orizontale, deci
 * "bounding box"-ul lor are înălțime zero — un gradient cu unități implicite
 * (`objectBoundingBox`) devine invalid pe un astfel de element și se randează
 * ca transparent. De aceea folosim `userSpaceOnUse` cu coordonate explicite.
 */
function ensureStaveGradient(svg: SVGSVGElement, x1: number, x2: number) {
  const existing = svg.querySelector(`#${STAVE_GRADIENT_ID}`)
  if (existing) existing.remove()

  const gradient = document.createElementNS(SVG_NS, "linearGradient")
  gradient.setAttribute("id", STAVE_GRADIENT_ID)
  gradient.setAttribute("gradientUnits", "userSpaceOnUse")
  gradient.setAttribute("x1", String(x1))
  gradient.setAttribute("y1", "0")
  gradient.setAttribute("x2", String(x2))
  gradient.setAttribute("y2", "0")

  const start = document.createElementNS(SVG_NS, "stop")
  start.setAttribute("offset", "0%")
  start.setAttribute("stop-color", INK_COLOR)

  const end = document.createElementNS(SVG_NS, "stop")
  end.setAttribute("offset", "100%")
  end.setAttribute("stop-color", ACCENT_COLOR)

  gradient.append(start, end)

  const defs = document.createElementNS(SVG_NS, "defs")
  defs.appendChild(gradient)
  svg.insertBefore(defs, svg.firstChild)
}

// poziții (linii + spații) de la linia de sus în jos, pentru fiecare cheie —
// folosite pentru a converti coordonata Y a unui click într-o înălțime concretă
const STAFF_POSITIONS: Record<Clef, Pitch[]> = {
  treble: buildStaffPositions(15, TOP_LINE_PITCH.treble),
  bass: buildStaffPositions(15, TOP_LINE_PITCH.bass),
  alto: buildStaffPositions(15, TOP_LINE_PITCH.alto),
}

function yToPitch(y: number, stave: Stave, clef: Clef): Pitch {
  const topY = stave.getYForLine(0)
  const bottomY = stave.getYForLine(4)
  // 4 linii => 8 jumătăți de interval (fiecare linie și fiecare spațiu = o treaptă)
  const stepSpacing = (bottomY - topY) / 8
  const positions = STAFF_POSITIONS[clef]
  let index = Math.round((y - topY) / stepSpacing)
  index = Math.max(0, Math.min(positions.length - 1, index))
  return positions[index]
}

// --- Layout pe măsuri și sisteme (rânduri de portative), ca în MuseScore ---
const MEASURE_WIDTH = 170
const HEADER_WIDTH = 70 // cheie + armură + măsură pe prima măsură a unui sistem
const KEY_ACCIDENTAL_WIDTH = 9 // spațiu rezervat pentru fiecare alterație din armură
const LEFT_MARGIN = 20
const LABEL_WIDTH = 64 // gutter în stânga pentru numele instrumentelor
const STAFF_ROW_HEIGHT = 84 // înălțimea verticală a unui portativ într-un sistem
const SYSTEM_GAP = 36 // spațiu între sisteme (rânduri)
const TOP_MARGIN = 36
const BOTTOM_MARGIN = 30

/** Împarte notele unui portativ în măsuri (liste de indici în `notes`), pe baza
 *  duratelor și a lungimii măsurii (`beatsPerMeasure`, în pătrimi) */
function splitIntoMeasures(notes: { duration: keyof typeof DURATION_BEATS }[], beatsPerMeasure: number): number[][] {
  const measures: number[][] = []
  let current: number[] = []
  let beats = 0

  notes.forEach((entry, i) => {
    const entryBeats = DURATION_BEATS[entry.duration]
    if (current.length > 0 && beats + entryBeats > beatsPerMeasure + 1e-9) {
      measures.push(current)
      current = []
      beats = 0
    }
    current.push(i)
    beats += entryBeats
    if (beats >= beatsPerMeasure - 1e-9) {
      measures.push(current)
      current = []
      beats = 0
    }
  })
  if (current.length > 0) measures.push(current)
  if (measures.length === 0) measures.push([])
  return measures
}

/** Numele scurt al instrumentului, pentru eticheta din stânga portativului */
function shortLabel(instrument: string): string {
  return instrument.length > 9 ? `${instrument.slice(0, 8)}…` : instrument
}

/** Găsește cel mai apropiat strămoș care derulează (overflow-y auto/scroll) */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

type StaffRow = { staffId: string; clef: Clef; stave: Stave; topY: number; bottomY: number }

/**
 * Portativ interactiv multi-instrument: randează toate portativele din starea
 * partajată, stivuite vertical și aliniate pe măsuri (barele de măsură se
 * potrivesc între instrumente, ca în MuseScore). Click pe un portativ adaugă o
 * notă în acel portativ (devine cel activ); click pe o notă o selectează; iar
 * tastatura editează nota selectată / portativul activ. Toate modificările trec
 * prin `dispatch`.
 */
export function InteractiveStave() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { staves, activeStaffId, selectedStaffIds, timeSignature, selectedId, dispatch } = useScoreEditor()

  const draw = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    // golirea containerului (mai jos) colapsează înălțimea la 0, ceea ce face
    // browserul să "prindă" scroll-ul strămoșului la 0; salvăm poziția și o
    // restaurăm la final, ca pagina să nu sară sus la fiecare redesenare
    const scroller = findScrollParent(container)
    const savedScrollTop = scroller?.scrollTop ?? 0

    container.innerHTML = ""

    const width = Math.max(container.clientWidth || 0, 420)
    const contentLeft = LEFT_MARGIN + LABEL_WIDTH
    const availableWidth = width - contentLeft - LEFT_MARGIN

    // armura e per portativ, dar rezervăm același spațiu de antet pe toate
    // (= cea mai lată armură), ca barele de măsură să rămână aliniate vertical
    const maxKeyAccidentals = staves.reduce((max, s) => Math.max(max, keyAccidentalCount(s.keySignature)), 0)
    const headerWidth = HEADER_WIDTH + maxKeyAccidentals * KEY_ACCIDENTAL_WIDTH
    const beatsPerMeasure = measureQuarters(timeSignature)

    // împărțim fiecare portativ în măsuri; numărul total de coloane de măsuri
    // e maximul dintre portative (cele mai scurte au măsuri goale la final)
    const staffMeasures = new Map<string, number[][]>()
    let measureCount = 1
    for (const staff of staves) {
      const measures = splitIntoMeasures(staff.notes, beatsPerMeasure)
      staffMeasures.set(staff.id, measures)
      measureCount = Math.max(measureCount, measures.length)
    }

    const measuresPerSystem = Math.max(1, Math.floor((availableWidth - headerWidth) / MEASURE_WIDTH))
    const systemCount = Math.max(1, Math.ceil(measureCount / measuresPerSystem))
    const systemHeight = staves.length * STAFF_ROW_HEIGHT + SYSTEM_GAP
    const height = TOP_MARGIN + systemCount * systemHeight + BOTTOM_MARGIN

    const renderer = new Renderer(container, Renderer.Backends.SVG)
    renderer.resize(width, height)
    const context = renderer.getContext()
    context.setFont("Georgia, serif", 10)

    const svgEl = container.querySelector<SVGSVGElement>("svg")
    if (svgEl) {
      // VexFlow randează svg-ul cu pointer-events="none" — îl repornim explicit,
      // altfel niciun click real al utilizatorului nu ajunge la portativ
      svgEl.setAttribute("pointer-events", "auto")
      svgEl.style.pointerEvents = "auto"
      svgEl.style.cursor = "crosshair"
      ensureStaveGradient(svgEl, contentLeft, contentLeft + availableWidth)
    }

    const staveGradient = `url(#${STAVE_GRADIENT_ID})`
    const noteIdToStaveNote = new Map<string, StaveNote>()
    const renderedNotes: { id: string; staffId: string; staveNote: StaveNote }[] = []
    const rows: StaffRow[] = []

    for (let systemIndex = 0; systemIndex < systemCount; systemIndex++) {
      const measureStart = systemIndex * measuresPerSystem
      const measuresInRow = Math.min(measuresPerSystem, measureCount - measureStart)
      // "justificăm" rândul: lățimea măsurilor umple toată lățimea disponibilă
      const stretchedMeasureWidth = (availableWidth - headerWidth) / measuresInRow
      const systemTop = TOP_MARGIN + systemIndex * systemHeight

      staves.forEach((staff, staffIndex) => {
        const staffY = systemTop + staffIndex * STAFF_ROW_HEIGHT
        const measures = staffMeasures.get(staff.id) ?? [[]]
        // bifat pentru redare parțială (Ctrl+click) — evidențiat printr-o bandă
        const inPlayback = selectedStaffIds.includes(staff.id)
        let x = contentLeft
        let firstStaveOfRow: Stave | null = null

        for (let col = 0; col < measuresInRow; col++) {
          const measureIndex = measureStart + col
          const isFirstOfSystem = col === 0
          const isVeryFirst = systemIndex === 0 && col === 0
          const measureWidth = isFirstOfSystem ? stretchedMeasureWidth + headerWidth : stretchedMeasureWidth

          const stave = new Stave(x, staffY, measureWidth)
          if (isFirstOfSystem) {
            stave.addClef(staff.clef)
            if (staff.keySignature !== "C") stave.addKeySignature(staff.keySignature)
            if (isVeryFirst) stave.addTimeSignature(timeSignatureLabel(timeSignature))
            firstStaveOfRow = stave

            // bandă de evidențiere în spatele întregului rând al portativului bifat
            if (inPlayback) {
              const bandTop = stave.getYForLine(0) - 10
              const bandBottom = stave.getYForLine(4) + 10
              context.setFillStyle("rgba(201, 169, 110, 0.12)")
              context.fillRect(LEFT_MARGIN, bandTop, contentLeft + availableWidth - LEFT_MARGIN, bandBottom - bandTop)
              context.setFillStyle(INK_COLOR)
            }
          }

          context.setStrokeStyle(staveGradient)
          context.setFillStyle(staveGradient)
          stave.setContext(context).draw()
          context.setStrokeStyle(INK_COLOR)
          context.setFillStyle(INK_COLOR)

          const measureNoteIndices = measures[measureIndex]
          if (measureNoteIndices && measureNoteIndices.length > 0) {
            const staveNotes = measureNoteIndices.map((noteIndex) => {
              const entry = staff.notes[noteIndex]
              const isRest = entry.type === "rest"
              const staveNote = new StaveNote({
                clef: staff.clef,
                keys: [pitchToVexflowKey(isRest ? DEFAULT_PITCH : entry.pitch)],
                duration: vexflowDurationCode(entry.duration, isRest),
              })
              if (!isRest && entry.pitch.accidental) {
                staveNote.addModifier(new Accidental(ACCIDENTAL_TO_VEXFLOW[entry.pitch.accidental]), 0)
              }
              if (!isRest && entry.articulations) {
                entry.articulations.forEach((articulation) => {
                  staveNote.addModifier(new Articulation(ARTICULATION_TO_VEXFLOW[articulation]), 0)
                })
              }
              const isSelected = entry.id === selectedId
              staveNote.setStyle({
                fillStyle: isSelected ? ACCENT_COLOR : INK_COLOR,
                strokeStyle: isSelected ? ACCENT_COLOR : INK_COLOR,
              })
              noteIdToStaveNote.set(entry.id, staveNote)
              renderedNotes.push({ id: entry.id, staffId: staff.id, staveNote })
              return staveNote
            })

            const voice = new Voice({ numBeats: timeSignature.numerator, beatValue: timeSignature.denominator })
            voice.setStrict(false)
            voice.addTickables(staveNotes)
            const formatWidth = measureWidth - (isFirstOfSystem ? headerWidth + 30 : 30)
            new Formatter().joinVoices([voice]).format([voice], Math.max(formatWidth, 40))
            voice.draw(context, stave)
          }

          x += measureWidth
        }

        // eticheta cu numele instrumentului, în stânga; activ sau bifat — auriu
        const labelStave = firstStaveOfRow
        if (labelStave) {
          context.setFillStyle(staff.id === activeStaffId || inPlayback ? ACCENT_COLOR : INK_COLOR)
          context.fillText(shortLabel(staff.instrument), LEFT_MARGIN, staffY + 26)
          context.setFillStyle(INK_COLOR)
          rows.push({
            staffId: staff.id,
            clef: staff.clef,
            stave: labelStave,
            topY: staffY,
            bottomY: staffY + STAFF_ROW_HEIGHT,
          })
        }
      })
    }

    // legăturile de expresie (legato), pe fiecare portativ, după ce notele au poziții
    context.setStrokeStyle(INK_COLOR)
    context.setFillStyle(INK_COLOR)
    staves.forEach((staff) => {
      staff.slurs.forEach((slur) => {
        const from = noteIdToStaveNote.get(slur.fromId)
        const to = noteIdToStaveNote.get(slur.toId)
        if (!from || !to) return
        new Curve(from, to, {}).setContext(context).draw()
      })
    })

    // click pe o notă -> o selectăm; Ctrl/Cmd+click -> bifează portativul ei
    // pentru redare parțială (folosim elementul SVG propriu fiecărei note)
    renderedNotes.forEach(({ id, staffId, staveNote }) => {
      const el = staveNote.getSVGElement()
      if (!el) return
      el.style.cursor = "pointer"
      el.addEventListener("click", (event) => {
        event.stopPropagation()
        if (event.ctrlKey || event.metaKey) {
          dispatch({ type: "toggleStaffSelection", staffId })
        } else {
          dispatch({ type: "selectNote", id })
        }
      })
    })

    // click pe un portativ (în afara unei note) -> adăugăm o notă în el;
    // Ctrl/Cmd+click -> bifează portativul pentru redare parțială
    if (svgEl) {
      svgEl.addEventListener("click", (event) => {
        const rect = svgEl.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const clickY = event.clientY - rect.top

        const row = rows.find((r) => clickY >= r.topY - 18 && clickY <= r.bottomY)
        if (!row) return

        if (event.ctrlKey || event.metaKey) {
          dispatch({ type: "toggleStaffSelection", staffId: row.staffId })
          return
        }

        // ignorăm zona cheii / armurii / măsurii din stânga primei măsuri
        if (clickX < contentLeft + headerWidth) return

        const pitch = yToPitch(clickY, row.stave, row.clef)
        dispatch({ type: "addNoteAtPitch", staffId: row.staffId, pitch })
      })
    }

    // restaurăm poziția de scroll salvată înainte de redesenare (vezi mai sus)
    if (scroller && scroller.scrollTop !== savedScrollTop) {
      scroller.scrollTop = savedScrollTop
    }
  }, [staves, activeStaffId, selectedStaffIds, timeSignature, selectedId, dispatch])

  useEffect(() => {
    draw()
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  // navigare/editare din tastatură (vezi indicațiile de sub portativ)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return
      }

      const hasModifier = event.metaKey || event.ctrlKey || event.altKey

      const hotkeyDuration = DURATION_HOTKEYS[event.key.toLowerCase()]
      if (hotkeyDuration && !hasModifier) {
        event.preventDefault()
        dispatch({ type: "setDuration", duration: hotkeyDuration })
        return
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        dispatch({ type: "moveSelection", direction: event.key === "ArrowRight" ? "next" : "prev" })
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        dispatch({ type: "insertNote" })
        return
      }

      const restDuration = REST_HOTKEYS[event.key.toLowerCase()]
      if (restDuration && !hasModifier) {
        event.preventDefault()
        dispatch({ type: "insertRest", duration: restDuration })
        return
      }

      if (!selectedId) return

      const accidentalType = ACCIDENTAL_HOTKEYS[event.key]
      if (accidentalType) {
        event.preventDefault()
        dispatch({ type: "toggleAccidental", accidental: accidentalType })
        return
      }

      // L -> leagă (legato) nota selectată de următoarea; a doua apăsare o elimină
      if (event.key.toLowerCase() === "l" && !hasModifier) {
        event.preventDefault()
        dispatch({ type: "toggleSlur" })
        return
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault()
        dispatch({ type: "transposeSelected", direction: event.key === "ArrowUp" ? "up" : "down" })
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        dispatch({ type: "deleteSelected" })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedId, dispatch])

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="w-full" />
      <p className="px-1 text-xs text-foreground-muted">
        Click pe un portativ — adaugă o notă în el (devine activ) · Click pe o notă — o selectează ·{" "}
        <span className="text-foreground">← / →</span> circulă între note ·{" "}
        <span className="text-foreground">↑ / ↓</span> schimbă înălțimea ·{" "}
        <span className="text-foreground">Q W E R T</span> durata ·{" "}
        <span className="text-foreground">Enter</span> notă nouă ·{" "}
        <span className="text-foreground">A S D F G</span> pauză ·{" "}
        <span className="text-foreground">[ ] \</span> alterație ·{" "}
        <span className="text-foreground">L</span> legato ·{" "}
        <span className="text-foreground">Delete</span> șterge ·{" "}
        <span className="text-foreground">Ctrl+click pe portativ</span> îl bifează pentru redare parțială
      </p>
    </div>
  )
}
