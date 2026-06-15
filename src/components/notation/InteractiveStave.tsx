import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
  Articulation,
  Beam,
  Curve,
  Dot,
  Fraction,
  StaveConnector,
  StaveTie,
  TabStave,
  TabNote,
  GhostNote,
  Tuplet,
} from "vexflow"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { buildStaffPositions, pitchIndex, pitchToVexflowKey, TOP_LINE_PITCH } from "@/lib/notation/pitch"
import { DURATION_HOTKEYS, REST_HOTKEYS, entryBeats, playbackQuarterBpm, tupletNormal, vexflowDurationCode } from "@/lib/notation/duration"
import { splitIntoMeasures, type MeasureFragment } from "@/lib/notation/measure"
import { ACCIDENTAL_HOTKEYS, ACCIDENTAL_TO_VEXFLOW } from "@/lib/notation/accidental"
import { ARTICULATION_TO_VEXFLOW } from "@/lib/notation/articulation"
import { keyAccidentalCount } from "@/lib/notation/keySignature"
import { instrumentLabel } from "@/lib/notation/instrument"
import { openStringPitch, stringCountForInstrument, supportsTab, tabPosition } from "@/lib/notation/tab"
import { onPlaybackHighlight, emitPlaybackHighlight } from "@/lib/audio/playbackHighlight"
import { auditionPitches } from "@/lib/audio/audition"
import { measureQuarters, timeSignatureLabel } from "@/lib/notation/timeSignature"
import type { Clef, NoteEntry, Pitch, Step } from "@/types/score"

const INK_COLOR = "#e8dcc8"
const ACCENT_COLOR = "#f3c544" // auriu aprins (spre galben) — selecția notelor sare în ochi
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
  // doar treptele de pe portativ (linia de sus … linia de jos) — notele de
  // deasupra/dedesubt se obțin apoi cu ↑/↓ (click-ul e limitat la portativ)
  index = Math.max(0, Math.min(8, Math.min(positions.length - 1, index)))
  return positions[index]
}

// --- Layout pe măsuri și sisteme (rânduri de portative), ca în MuseScore ---
const MEASURE_WIDTH = 170
const HEADER_WIDTH = 70 // cheie + armură + măsură pe prima măsură a unui sistem
const KEY_ACCIDENTAL_WIDTH = 9 // spațiu rezervat pentru fiecare alterație din armură
const LEFT_MARGIN = 20
const LABEL_WIDTH = 64 // gutter în stânga pentru numele instrumentelor
const STAFF_ROW_HEIGHT = 88 // înălțimea de bază (compactă) a unui portativ; crește dinamic
const GRAND_STAFF_GAP = 80 // spațiu între portativele aceluiași instrument (pian / notație+TAB)
const SYSTEM_GAP = 40 // spațiu între sisteme (rânduri)
const STEP_PX = 6 // pixeli per treaptă diatonică (pentru spațierea dinamică)
const LEDGER_SLACK = 30 // câte linii suplimentare „încap" în spațiul de bază înainte să mărim
const TOP_MARGIN = 36
const BOTTOM_MARGIN = 30
const LYRIC_OFFSET = 20 // distanța (px) sub linia de jos a portativului pentru versuri

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

type StaffRow = {
  staffId: string
  clef: Clef
  stave: Stave
  topY: number
  bottomY: number
  systemIndex: number
}

/** Literele care introduc note în modul de introducere (N), ca în MuseScore */
const NOTE_KEYS: Record<string, Step> = { c: "C", d: "D", e: "E", f: "F", g: "G", a: "A", b: "B" }

/** Cifrele 1–5 aleg durata în modul de introducere (literele sunt ocupate de note) */
const DIGIT_DURATIONS: Record<string, "whole" | "half" | "quarter" | "eighth" | "sixteenth"> = {
  "1": "whole",
  "2": "half",
  "3": "quarter",
  "4": "eighth",
  "5": "sixteenth",
}

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
  // wrapper poziționat (relative) peste care plutește input-ul de versuri —
  // stă în AFARA containerului SVG (care se golește la fiecare redesenare)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const {
    staves,
    activeStaffId,
    selectedStaffIds,
    timeSignature,
    selectedId,
    selectedIds,
    selectedPitchIndex,
    selectedDuration,
    viewMode,
    meta,
    playbackRate,
    mixer,
    player,
    setIsPlaying,
    dispatch,
  } = useScoreEditor()
  // modul de introducere a notelor din tastatură (comutat cu N, ca în MuseScore)
  const [noteInputMode, setNoteInputMode] = useState(false)

  // modul de versuri (comutat cu M, ca modul N de note): scrii silaba sub nota
  // SELECTATĂ, iar input-ul plutitor o urmărește. `lyricText` = textul din câmp,
  // `lyricPos` = poziția (în coordonatele wrapper-ului) a input-ului plutitor.
  const [lyricMode, setLyricMode] = useState(false)
  const [lyricText, setLyricText] = useState("")
  const [lyricPos, setLyricPos] = useState<{ left: number; top: number } | null>(null)
  const lyricInputRef = useRef<HTMLInputElement>(null)

  // clipboard pentru copy/paste — date efemere (nu intră în partitură, nici în
  // istoricul undo), deci trăiesc într-un ref, nu în reducer
  const clipboardRef = useRef<NoteEntry[]>([])
  // buffer pentru tastarea fret-urilor în TAB (două cifre tastate rapid → ex. 12)
  const fretBufferRef = useRef<{ ts: number; digits: string }>({ ts: 0, digits: "" })
  // oglindă a selecției curente pentru handler-ul de tastatură (Ctrl+C / Space
  // citesc selecția fără să re-abonăm listener-ul la fiecare schimbare)
  const selectionRef = useRef<{
    staves: typeof staves
    selectedIds: string[]
    selectedId: string | null
    selectedStaffIds: string[]
    activeStaffId: string
    meta: typeof meta
    playbackRate: number
  }>({ staves, selectedIds, selectedId, selectedStaffIds, activeStaffId, meta, playbackRate })
  useEffect(() => {
    selectionRef.current = { staves, selectedIds, selectedId, selectedStaffIds, activeStaffId, meta, playbackRate }
  }, [staves, selectedIds, selectedId, selectedStaffIds, activeStaffId, meta, playbackRate])

  // linia de jos a fiecărui portativ (în coordonate SVG), pe „staffId:systemIndex"
  // — folosită ca să așezăm input-ul de versuri exact unde se desenează silaba
  const rowBottomRef = useRef<Map<string, number>>(new Map())
  // elementele SVG ale notelor randate, pe id — folosite de evidențierea din
  // timpul redării ca să recoloreze direct nota curentă, fără re-randare React
  const svgNoteElsRef = useRef<Map<string, SVGElement>>(new Map())
  // atributele originale ale elementelor recolorate, ca să le putem restaura exact
  const highlightRestoreRef = useRef<{ el: Element; fill: string | null; stroke: string | null }[]>([])

  // --- cursorul vertical de redare (alunecă de la nota curentă spre următoarea) ---
  // poziția fiecărei note: x absolut, rândul (sistemul) și nota următoare din portativ
  const noteMetaRef = useRef<Map<string, { x: number; systemIndex: number; nextId: string | null }>>(new Map())
  // geometria rândurilor (top/bottom pe Y) și marginea dreaptă a conținutului
  const cursorLayoutRef = useRef<{ systems: { top: number; bottom: number }[]; rightEdge: number } | null>(null)
  const cursorElRef = useRef<SVGRectElement | null>(null)
  const cursorAnimRef = useRef<number | null>(null)
  // ultimul rând pe care a fost cursorul — auto-scroll doar la schimbarea rândului
  const cursorSystemRef = useRef(-1)

  const draw = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    // golirea containerului (mai jos) colapsează înălțimea la 0, ceea ce face
    // browserul să "prindă" scroll-ul strămoșului la 0; salvăm pozițiile și le
    // restaurăm la final, ca pagina să nu sară la fiecare redesenare
    // (containerul însuși e derulorul orizontal, în vizualizarea continuă)
    const scroller = findScrollParent(container)
    const savedScrollTop = scroller?.scrollTop ?? 0
    const savedScrollLeft = container.scrollLeft

    container.innerHTML = ""

    const contentLeft = LEFT_MARGIN + LABEL_WIDTH
    // notele din selecția curentă (interval sau notă simplă) — colorate auriu
    const selectedIdSet = new Set(selectedIds)

    // armura e per portativ, dar rezervăm același spațiu de antet pe toate
    // (= cea mai lată armură), ca barele de măsură să rămână aliniate vertical
    const maxKeyAccidentals = staves.reduce((max, s) => Math.max(max, keyAccidentalCount(s.keySignature)), 0)
    const headerWidth = HEADER_WIDTH + maxKeyAccidentals * KEY_ACCIDENTAL_WIDTH
    const beatsPerMeasure = measureQuarters(timeSignature)

    // împărțim fiecare portativ în măsuri; numărul total de coloane de măsuri
    // e maximul dintre portative (cele mai scurte au măsuri goale la final)
    const staffMeasures = new Map<string, MeasureFragment[][]>()
    let measureCount = 1
    for (const staff of staves) {
      const measures = splitIntoMeasures(staff.notes, beatsPerMeasure)
      staffMeasures.set(staff.id, measures)
      measureCount = Math.max(measureCount, measures.length)
    }

    // lățimi și rupere pe rânduri, după modul de vizualizare:
    //  - "page": lățimea = containerul; măsurile se rup pe rânduri și se justifică
    //  - "continuous": un singur rând cu măsuri de lățime fixă; SVG-ul devine
    //    oricât de lat e conținutul, iar containerul derulează orizontal
    let width: number
    let availableWidth: number
    let measuresPerSystem: number
    if (viewMode === "continuous") {
      measuresPerSystem = measureCount
      // cu availableWidth = antet + n × lățime fixă, formula de "justificare"
      // de mai jos dă exact MEASURE_WIDTH — restul codului rămâne neschimbat
      availableWidth = headerWidth + measureCount * MEASURE_WIDTH
      width = contentLeft + availableWidth + LEFT_MARGIN
    } else {
      width = Math.max(container.clientWidth || 0, 420)
      availableWidth = width - contentLeft - LEFT_MARGIN
      measuresPerSystem = Math.max(1, Math.floor((availableWidth - headerWidth) / MEASURE_WIDTH))
    }
    const systemCount = Math.max(1, Math.ceil(measureCount / measuresPerSystem))

    // grupuri (instrumente): pentru fiecare portativ, indicii portativelor din
    // același grup (pian = 2). Portativele aceluiași grup stau mai apropiate.
    const groupMembers: number[][] = staves.map((staff, i) =>
      staff.groupId ? staves.flatMap((s, j) => (s.groupId === staff.groupId ? [j] : [])) : [i],
    )
    // modul de afișare al fiecărui portativ (doar chitarele suportă TAB)
    const staffDisplays = staves.map((s) =>
      supportsTab(s.instrument) ? (s.display ?? "notation") : "notation",
    )
    // spațiere DINAMICĂ: cât depășesc notele portativul (în px, peste o rezervă),
    // ca portativele să se depărteze doar când notele urcă/coboară mult (și să
    // revină când le cobori). Doar notația are linii suplimentare; TAB-ul nu.
    const extentUp: number[] = []
    const extentDown: number[] = []
    staves.forEach((staff, i) => {
      let up = 0
      let down = 0
      if (staffDisplays[i] !== "tab" && staff.notes.length > 0) {
        const topIdx = pitchIndex(TOP_LINE_PITCH[staff.clef]) // linia de sus
        const bottomIdx = topIdx - 8 // linia de jos = 8 trepte mai jos
        for (const n of staff.notes) {
          if (n.type !== "note") continue
          for (const p of n.pitches) {
            const idx = pitchIndex(p)
            if (idx - topIdx > up) up = idx - topIdx
            if (bottomIdx - idx > down) down = bottomIdx - idx
          }
        }
      }
      extentUp[i] = Math.max(0, up * STEP_PX - LEDGER_SLACK)
      extentDown[i] = Math.max(0, down * STEP_PX - LEDGER_SLACK)
    })
    // în „ambele", TAB-ul coboară și cu spațiul cerut de notele joase ale notației
    const tabOffsets = staves.map((_, i) => STAFF_ROW_HEIGHT + extentDown[i])

    // înălțimea ocupată de fiecare portativ: bază (mai mică în interiorul unui grup)
    // + spațiul pentru notele joase ale lui + cele înalte ale portativului următor;
    // „ambele" adaugă rândul de TAB
    const staffSpan: number[] = staves.map((staff, i) => {
      const next = staves[i + 1]
      const tight = !!next && !!staff.groupId && next.groupId === staff.groupId
      const base = tight ? GRAND_STAFF_GAP : STAFF_ROW_HEIGHT
      const upNext = next ? extentUp[i + 1] : 0
      if (staffDisplays[i] === "both") return tabOffsets[i] + STAFF_ROW_HEIGHT + upNext
      return base + extentDown[i] + upNext
    })
    // offset-ul vertical al fiecărui portativ în cadrul unui sistem
    const staffOffsets: number[] = []
    staffSpan.reduce((acc, span, i) => {
      staffOffsets[i] = acc
      return acc + span
    }, 0)
    const innerHeight = staffSpan.reduce((a, b) => a + b, 0)
    const systemHeight = innerHeight + SYSTEM_GAP
    // rezervă deasupra primului portativ pentru notele lui înalte
    const topPad = TOP_MARGIN + (extentUp[0] ?? 0)
    const height = topPad + systemCount * systemHeight + BOTTOM_MARGIN

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
    const renderedNotes: {
      id: string
      staffId: string
      staveNote: StaveNote
      systemIndex: number
      isRest: boolean
      /** false pentru fragmentele de continuare ale unei note legate peste bară */
      firstOfNote: boolean
    }[] = []
    // ligaturile generate de spargerea notelor peste bară: perechi de fragmente
    // consecutive ale aceleiași note (pe același sistem). `pendingTie` ține
    // fragmentul de start până vine cel de stop.
    const pendingTie = new Map<string, { sn: StaveNote; systemIndex: number }>()
    const ties: { first: StaveNote; last: StaveNote; count: number }[] = []
    const rows: StaffRow[] = []
    // rândurile de TAB: ținta click-ului pe tablatură (liniile = corzi). `stringYs`
    // = Y-ul fiecărei corzi, ca să alegem coarda apăsată; `noteX` = pozițiile
    // notelor TAB pe orizontală, pentru selecție pe coloană.
    const tabRows: {
      staffId: string
      instrument: string
      systemIndex: number
      topY: number
      bottomY: number
      stringYs: number[]
    }[] = []
    const tabRendered: { id: string; staffId: string; systemIndex: number; x: number }[] = []
    // limitele orizontale ale fiecărei măsuri (aceleași pe toate portativele,
    // barele fiind aliniate) — pentru a ști în ce măsură s-a dat click
    const measureSpans: { systemIndex: number; measureIndex: number; xStart: number; xEnd: number }[] = []
    // geometria rândurilor, pentru cursorul de redare (înălțimea lui pe fiecare rând)
    const systemBounds: { top: number; bottom: number }[] = []

    for (let systemIndex = 0; systemIndex < systemCount; systemIndex++) {
      const measureStart = systemIndex * measuresPerSystem
      const measuresInRow = Math.min(measuresPerSystem, measureCount - measureStart)
      // "justificăm" rândul: lățimea măsurilor umple toată lățimea disponibilă
      const stretchedMeasureWidth = (availableWidth - headerWidth) / measuresInRow
      const systemTop = topPad + systemIndex * systemHeight
      systemBounds.push({ top: systemTop, bottom: systemTop + innerHeight })
      // prima măsură (col 0) a fiecărui portativ din sistem — pentru acolade
      const systemFirstStaves: (Stave | null)[] = []
      const systemFirstTabStaves: (TabStave | null)[] = []

      staves.forEach((staff, staffIndex) => {
        const staffY = systemTop + staffOffsets[staffIndex]
        const measures = staffMeasures.get(staff.id) ?? [[]]
        // bifat pentru redare parțială (Ctrl+click) — evidențiat printr-o bandă
        const inPlayback = selectedStaffIds.includes(staff.id)
        let x = contentLeft
        let firstStaveOfRow: Stave | null = null
        let firstTabStaveOfRow: TabStave | null = null
        // modul de afișare al acestui portativ (notație / TAB / ambele)
        const display = staffDisplays[staffIndex]
        const showNotation = display !== "tab"
        const showTab = display === "tab" || display === "both"
        // în „ambele", TAB-ul stă sub notație (coborât și cu spațiul notelor joase);
        // în „TAB", ocupă rândul portativului
        const tabYOffset = showNotation ? tabOffsets[staffIndex] : 0
        const stringCount = stringCountForInstrument(staff.instrument)

        for (let col = 0; col < measuresInRow; col++) {
          const measureIndex = measureStart + col
          const isFirstOfSystem = col === 0
          const isVeryFirst = systemIndex === 0 && col === 0
          const measureWidth = isFirstOfSystem ? stretchedMeasureWidth + headerWidth : stretchedMeasureWidth

          // limitele măsurii (o singură dată — sunt aceleași pe toate portativele)
          if (staffIndex === 0) {
            measureSpans.push({ systemIndex, measureIndex, xStart: x, xEnd: x + measureWidth })
          }

          // --- sub-portativ de NOTAȚIE ---
          if (showNotation) {
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

          // mică margine între antet (cheie/armură/măsură) și prima notă —
          // altfel nu există loc de click pentru a insera ÎNAINTEA primei note
          if (isFirstOfSystem) {
            stave.setNoteStartX(stave.getNoteStartX() + 16)
          }

          const measureFragments = measures[measureIndex]
          if (measureFragments && measureFragments.length > 0) {
            // grupurile de tuplet din această măsură (bracket + „3"), pe tupletId
            const measureTuplets = new Map<string, { count: number; notes: StaveNote[] }>()
            const staveNotes = measureFragments.map((frag) => {
              const entry = staff.notes[frag.noteIndex]
              const isRest = entry.type === "rest"
              // primul fragment al notei poartă alterațiile/articulațiile/nuanța;
              // fragmentele de continuare (legate peste bară) nu le repetă
              const isContinuation = !!frag.tieStop
              // o intrare poate avea mai multe înălțimi (acord) — toate pe același StaveNote.
              // pauza se așază pe linia din MIJLOC a cheii (index 4 = linia 2) —
              // altfel (cu Si4 fix) apare prea sus în cheia fa / do
              const pitches = isRest ? [STAFF_POSITIONS[staff.clef][4]] : entry.pitches
              const staveNote = new StaveNote({
                clef: staff.clef,
                keys: pitches.map(pitchToVexflowKey),
                duration: vexflowDurationCode(frag.duration, isRest),
              })
              if (!isRest && !isContinuation) {
                entry.pitches.forEach((pitch, pitchIdx) => {
                  if (pitch.accidental) {
                    staveNote.addModifier(new Accidental(ACCIDENTAL_TO_VEXFLOW[pitch.accidental]), pitchIdx)
                  }
                })
              }
              if (!isRest && !isContinuation && entry.articulations) {
                entry.articulations.forEach((articulation) => {
                  staveNote.addModifier(new Articulation(ARTICULATION_TO_VEXFLOW[articulation]), 0)
                })
              }
              // punctul de prelungire — pe fragmentul curent (poate diferi de
              // nota originală după spargerea peste bară)
              if (frag.dotted) {
                Dot.buildAndAttach([staveNote], { all: true })
              }

              // colectăm ligaturile între fragmentele aceleiași note (pe același sistem)
              const tieKey = `${staff.id}:${frag.noteIndex}`
              if (frag.tieStop) {
                const prev = pendingTie.get(tieKey)
                if (prev && prev.systemIndex === systemIndex) {
                  ties.push({ first: prev.sn, last: staveNote, count: pitches.length })
                }
              }
              if (frag.tieStart) pendingTie.set(tieKey, { sn: staveNote, systemIndex })
              else pendingTie.delete(tieKey)

              const isSelected = selectedIdSet.has(entry.id)
              // cu o înălțime selectată dintr-un ACORD, doar capul ei e auriu
              // (nota simplă rămâne aurie integral, cu tot cu codiță); valabil
              // doar la selecția simplă (un interval colorează note întregi)
              const headOnly =
                entry.id === selectedId &&
                selectedIdSet.size <= 1 &&
                selectedPitchIndex !== null &&
                !isRest &&
                entry.pitches.length > 1
              const noteColor = isSelected && !headOnly ? ACCENT_COLOR : INK_COLOR
              staveNote.setStyle({ fillStyle: noteColor, strokeStyle: noteColor })
              if (headOnly) {
                // ATENȚIE: la codița în jos, VexFlow construiește capetele în
                // ordine inversă — mapăm prin rangul liniei (linia crește cu
                // înălțimea), nu prin indicele din `noteHeads`
                const byLine = staveNote.noteHeads
                  .map((head, headIdx) => ({ headIdx, line: head.getLine() }))
                  .sort((a, b) => a.line - b.line)
                const headIdx = byLine[selectedPitchIndex]?.headIdx
                if (headIdx !== undefined) {
                  staveNote.noteHeads[headIdx]?.setStyle({
                    fillStyle: ACCENT_COLOR,
                    strokeStyle: ACCENT_COLOR,
                  })
                }
              }
              // colectăm notele pe grupul de tuplet, ca să desenăm bracket-ul + „3"
              if (frag.tupletId && frag.tuplet) {
                const group = measureTuplets.get(frag.tupletId)
                if (group) group.notes.push(staveNote)
                else measureTuplets.set(frag.tupletId, { count: frag.tuplet, notes: [staveNote] })
              }
              // slururile (legato) se leagă de începutul notei — folosim primul fragment
              if (!noteIdToStaveNote.has(entry.id)) noteIdToStaveNote.set(entry.id, staveNote)
              renderedNotes.push({
                id: entry.id,
                staffId: staff.id,
                staveNote,
                systemIndex,
                isRest,
                firstOfNote: !isContinuation,
              })
              return staveNote
            })

            // creăm tuplet-urile ÎNAINTE de formatare: `setTuplet` reduce tick-urile
            // notelor (un triolet ocupă spațiul a 2 optimi, nu 3); altfel formatter-ul
            // vede 3 optimi întregi și lățește măsura. Le desenăm abia după voce.
            const tuplets: Tuplet[] = []
            measureTuplets.forEach(({ count, notes }) => {
              if (notes.length >= 2) {
                tuplets.push(new Tuplet(notes, { numNotes: count, notesOccupied: tupletNormal(count) }))
              }
            })

            // optimile/șaisprezecimile consecutive se grupează cu bară (beam),
            // ca în notația tipărită; în măsurile cu numitor 8 (6/8, 3/8) se
            // grupează câte trei optimi, altfel pe timpi de pătrime (implicit)
            const beamGroups = timeSignature.denominator === 8 ? [new Fraction(3, 8)] : undefined
            const beams = Beam.generateBeams(staveNotes, beamGroups ? { groups: beamGroups } : undefined)
            beams.forEach((beam) => beam.setStyle({ fillStyle: INK_COLOR, strokeStyle: INK_COLOR }))

            const voice = new Voice({ numBeats: timeSignature.numerator, beatValue: timeSignature.denominator })
            voice.setStrict(false)
            voice.addTickables(staveNotes)
            const formatWidth = measureWidth - (isFirstOfSystem ? headerWidth + 30 : 30)
            new Formatter().joinVoices([voice]).format([voice], Math.max(formatWidth, 40))
            voice.draw(context, stave)
            beams.forEach((beam) => beam.setContext(context).draw())

            // bracket-urile de tuplet (triolet) + numărul „3", după voce (notele
            // au deja poziții); tick-urile au fost reduse la creare, mai sus
            if (tuplets.length > 0) {
              context.setFillStyle(INK_COLOR)
              context.setStrokeStyle(INK_COLOR)
              tuplets.forEach((t) => t.setContext(context).draw())
            }
          }
          } // showNotation

          // --- sub-portativ de TAB (tablatură) ---
          if (showTab) {
            const tabStave = new TabStave(x, staffY + tabYOffset, measureWidth, { numLines: stringCount })
            if (isFirstOfSystem) {
              tabStave.addClef("tab")
              firstTabStaveOfRow = tabStave
            }
            context.setStrokeStyle(staveGradient)
            context.setFillStyle(staveGradient)
            tabStave.setContext(context).draw()
            context.setStrokeStyle(INK_COLOR)
            context.setFillStyle(INK_COLOR)
            if (isFirstOfSystem) tabStave.setNoteStartX(tabStave.getNoteStartX() + 16)

            const tabFrags = measures[measureIndex]
            if (tabFrags && tabFrags.length > 0) {
              const built: { entry: NoteEntry; tabNote: TabNote | GhostNote }[] = tabFrags.map((frag) => {
                const entry = staff.notes[frag.noteIndex]
                if (entry.type === "rest") {
                  // pauzele în TAB: spațiu invizibil (păstrează alinierea pe timpi)
                  return { entry, tabNote: new GhostNote({ duration: vexflowDurationCode(frag.duration, false) }) }
                }
                const positions = entry.pitches.map((p) => tabPosition(p, staff.instrument))
                const tabNote = new TabNote({ positions, duration: vexflowDurationCode(frag.duration, false) })
                if (frag.dotted) Dot.buildAndAttach([tabNote], { all: true })
                const color = selectedIdSet.has(entry.id) ? ACCENT_COLOR : INK_COLOR
                tabNote.setStyle({ fillStyle: color, strokeStyle: color })
                return { entry, tabNote }
              })
              const voice = new Voice({ numBeats: timeSignature.numerator, beatValue: timeSignature.denominator })
              voice.setStrict(false)
              voice.addTickables(built.map((b) => b.tabNote))
              const formatWidth = measureWidth - (isFirstOfSystem ? headerWidth + 30 : 30)
              new Formatter().joinVoices([voice]).format([voice], Math.max(formatWidth, 40))
              voice.draw(context, tabStave)
              built.forEach((b) => {
                // includem și pauzele (pentru inserare corectă pe poziție)
                tabRendered.push({ id: b.entry.id, staffId: staff.id, systemIndex, x: b.tabNote.getAbsoluteX() })
              })
            }
          }

          x += measureWidth
        }

        const labelStave = firstStaveOfRow ?? firstTabStaveOfRow
        if (labelStave) {
          // acoladele de grup (pian) se leagă de portativul de notație
          if (firstStaveOfRow) systemFirstStaves[staffIndex] = firstStaveOfRow
          if (firstTabStaveOfRow) systemFirstTabStaves[staffIndex] = firstTabStaveOfRow

          // numele instrumentului se scrie o singură dată pe grup, centrat
          // vertical între portativele lui (pentru pian — între cheie sol și fa)
          const members = groupMembers[staffIndex]
          if (members[0] === staffIndex) {
            const firstY = systemTop + staffOffsets[members[0]]
            const lastY = systemTop + staffOffsets[members[members.length - 1]]
            const groupActive = members.some((j) => staves[j].id === activeStaffId)
            const groupInPlayback = members.some((j) => selectedStaffIds.includes(staves[j].id))
            // resetăm fontul: desenarea trioletului („3") lasă contextul cu alt
            // font, iar eticheta ar moșteni dimensiunea aceea (devenea gigantică)
            context.setFont("Georgia, serif", 10)
            context.setFillStyle(groupActive || groupInPlayback ? ACCENT_COLOR : INK_COLOR)
            context.fillText(instrumentLabel(staff.instrument), LEFT_MARGIN, (firstY + lastY) / 2 + 26)
            context.setFillStyle(INK_COLOR)
          }

          // zona de click pe NOTAȚIE = strict liniile portativului (±8px la handler)
          if (showNotation && firstStaveOfRow) {
            rows.push({
              staffId: staff.id,
              clef: staff.clef,
              stave: firstStaveOfRow,
              topY: firstStaveOfRow.getYForLine(0),
              bottomY: firstStaveOfRow.getYForLine(4),
              systemIndex,
            })
          }
          // zona de click pe TAB = liniile corzilor (alegi coarda apăsată)
          if (showTab && firstTabStaveOfRow) {
            const ts = firstTabStaveOfRow
            const stringYs = Array.from({ length: stringCount }, (_, i) => ts.getYForLine(i))
            tabRows.push({
              staffId: staff.id,
              instrument: staff.instrument,
              systemIndex,
              topY: stringYs[0],
              bottomY: stringYs[stringYs.length - 1],
              stringYs,
            })
          }
        }
      })

      // acolade pentru instrumentele cu portativ dublu (pian/orgă): legăm primul
      // și ultimul portativ al fiecărui grup printr-o acoladă + linie verticală
      context.setStrokeStyle(INK_COLOR)
      context.setFillStyle(INK_COLOR)
      staves.forEach((_, staffIndex) => {
        const members = groupMembers[staffIndex]
        if (members.length < 2 || members[0] !== staffIndex) return
        const top = systemFirstStaves[members[0]]
        const bottom = systemFirstStaves[members[members.length - 1]]
        if (!top || !bottom) return
        new StaveConnector(top, bottom).setType("brace").setContext(context).draw()
        new StaveConnector(top, bottom).setType("singleLeft").setContext(context).draw()
      })

      // acoladă pentru chitara în modul „ambele": leagă notația de TAB
      staves.forEach((_, staffIndex) => {
        if (staffDisplays[staffIndex] !== "both") return
        const top = systemFirstStaves[staffIndex]
        const bottom = systemFirstTabStaves[staffIndex]
        if (!top || !bottom) return
        new StaveConnector(top, bottom).setType("brace").setContext(context).draw()
        new StaveConnector(top, bottom).setType("singleLeft").setContext(context).draw()
      })
    }

    // ligaturile (tie) dintre fragmentele notelor sparte peste bară
    context.setStrokeStyle(INK_COLOR)
    context.setFillStyle(INK_COLOR)
    ties.forEach(({ first, last, count }) => {
      const indices = Array.from({ length: count }, (_, i) => i)
      new StaveTie({ firstNote: first, lastNote: last, firstIndexes: indices, lastIndexes: indices })
        .setContext(context)
        .draw()
    })

    // legăturile de expresie (legato), pe fiecare portativ, după ce notele au poziții
    staves.forEach((staff) => {
      staff.slurs.forEach((slur) => {
        const from = noteIdToStaveNote.get(slur.fromId)
        const to = noteIdToStaveNote.get(slur.toId)
        if (!from || !to) return
        new Curve(from, to, {}).setContext(context).draw()
      })
    })

    // nuanțele (dinamici): text italic bold sub portativ, la x-ul notei pe care
    // sunt plasate (le desenăm ca <text> SVG direct, ca etichetele/cursorul)
    if (svgEl) {
      const rowBottom = new Map<string, number>()
      rows.forEach((r) => rowBottom.set(`${r.staffId}:${r.systemIndex}`, r.bottomY))
      rowBottomRef.current = rowBottom // pentru poziționarea input-ului de versuri
      renderedNotes.forEach(({ id, staffId, staveNote, systemIndex, firstOfNote }) => {
        if (!firstOfNote) return
        const entry = staves.find((s) => s.id === staffId)?.notes.find((n) => n.id === id)
        if (!entry?.dynamic) return
        const bottomY = rowBottom.get(`${staffId}:${systemIndex}`)
        if (bottomY === undefined) return
        const text = document.createElementNS(SVG_NS, "text")
        text.setAttribute("x", String(staveNote.getAbsoluteX() - 2))
        text.setAttribute("y", String(bottomY + 30))
        text.setAttribute("font-family", "Georgia, serif")
        text.setAttribute("font-style", "italic")
        text.setAttribute("font-weight", "bold")
        text.setAttribute("font-size", "13")
        // culoarea prin stil inline (prioritate maximă) — ca atributul `fill` să
        // nu fie suprascris de stiluri moștenite și textul să iasă crem/auriu
        text.style.fill = selectedIdSet.has(id) ? ACCENT_COLOR : INK_COLOR
        text.setAttribute("pointer-events", "none")
        text.textContent = entry.dynamic
        svgEl.appendChild(text)
      })

      // versurile: silaba centrată sub nota ei (sub nuanțe). Nota aflată acum în
      // editare nu se desenează — în locul ei plutește input-ul HTML.
      renderedNotes.forEach(({ id, staffId, staveNote, systemIndex, firstOfNote, isRest }) => {
        if (!firstOfNote || isRest) return
        if (lyricMode && selectedId === id) return // se editează acum (input deasupra)
        const entry = staves.find((s) => s.id === staffId)?.notes.find((n) => n.id === id)
        if (!entry?.lyric) return
        const bottomY = rowBottom.get(`${staffId}:${systemIndex}`)
        if (bottomY === undefined) return
        const text = document.createElementNS(SVG_NS, "text")
        text.setAttribute("x", String(staveNote.getAbsoluteX() + 5))
        text.setAttribute("y", String(bottomY + LYRIC_OFFSET))
        text.setAttribute("text-anchor", "middle")
        text.setAttribute("font-family", "Georgia, serif")
        text.setAttribute("font-size", "12")
        text.style.fill = selectedIdSet.has(id) ? ACCENT_COLOR : INK_COLOR
        text.setAttribute("pointer-events", "none")
        text.textContent = entry.lyric
        svgEl.appendChild(text)
      })
    }

    // după re-randare, vechile elemente SVG nu mai există — golim hărțile
    // folosite de evidențierea din timpul redării și oprim animația cursorului
    svgNoteElsRef.current = new Map()
    highlightRestoreRef.current = []
    if (cursorAnimRef.current !== null) {
      cancelAnimationFrame(cursorAnimRef.current)
      cursorAnimRef.current = null
    }

    // pozițiile notelor pentru cursorul de redare: x absolut (după formatare),
    // rândul și nota următoare din același portativ (ținta alunecării)
    const noteMeta = new Map<string, { x: number; systemIndex: number; nextId: string | null }>()
    renderedNotes.forEach(({ id, staveNote, systemIndex, firstOfNote }) => {
      // o notă spartă peste bară are mai multe fragmente — cursorul pornește de
      // la primul (începutul notei)
      if (firstOfNote) noteMeta.set(id, { x: staveNote.getAbsoluteX(), systemIndex, nextId: null })
    })
    staves.forEach((staff) => {
      staff.notes.forEach((entry, i) => {
        const meta = noteMeta.get(entry.id)
        const next = staff.notes[i + 1]
        if (meta && next) meta.nextId = next.id
      })
    })
    noteMetaRef.current = noteMeta
    cursorLayoutRef.current = { systems: systemBounds, rightEdge: contentLeft + availableWidth }

    // cursorul propriu-zis: un dreptunghi subțire, invizibil până la redare
    if (svgEl) {
      const cursor = document.createElementNS(SVG_NS, "rect") as SVGRectElement
      cursor.setAttribute("width", "2")
      cursor.setAttribute("fill", ACCENT_COLOR)
      cursor.setAttribute("opacity", "0.6")
      cursor.setAttribute("visibility", "hidden")
      cursor.setAttribute("pointer-events", "none")
      svgEl.appendChild(cursor)
      cursorElRef.current = cursor
    }

    // Selecția notelor se face prin hit-testing pe coordonate (un singur handler
    // pe SVG), nu prin pointer-events pe elemente — hitbox exact, de mărimea
    // glyph-ului, fără capriciile bbox-urilor SVG (grupul unei note e cât tot
    // portativul pe verticală). Colectăm centrul fiecărui cap de notă/pauză:
    const noteHits: {
      id: string
      staffId: string
      pitchIndex?: number
      x: number
      y: number
      halfW: number
      halfH: number
    }[] = []
    renderedNotes.forEach(({ id, staffId, staveNote, isRest, firstOfNote }) => {
      const el = staveNote.getSVGElement()
      if (el) {
        // evidențierea la redare țintește începutul notei (primul fragment)
        if (firstOfNote) svgNoteElsRef.current.set(id, el)
        // grupul notei nu interceptează click-uri — totul trece prin handler-ul SVG
        el.style.pointerEvents = "none"
      }
      // poziția reală a fiecărui cap = bbox-ul GLYPH-ului din DOM (primul copil
      // al grupului): VexFlow desenează modificatorii (punct, alterații,
      // articulații) ÎN INTERIORUL grupului de cap, deci bbox-ul grupului se
      // umflă mult peste glyph și ar prinde click-uri dintre portative
      const heads = staveNote.noteHeads
        .map((head) => head.getSVGElement())
        .filter((headEl): headEl is SVGGraphicsElement => !!headEl && "getBBox" in headEl)
        .map((headEl) => {
          const glyph = headEl.firstElementChild
          const box = (glyph && "getBBox" in glyph ? (glyph as SVGGraphicsElement) : headEl).getBBox()
          return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            // plafonate — capul unei note nu depășește ~o treaptă și jumătate
            halfW: Math.min(box.width / 2, 8),
            halfH: Math.min(box.height / 2, 6),
          }
        })
      // sortăm descrescător după y (y mic = sus = înălțime mare) ca indicele
      // să corespundă cu `pitches` (ascendent) indiferent de direcția codiței
      heads.sort((a, b) => b.y - a.y)
      heads.forEach((head, pitchIdx) => {
        noteHits.push({ id, staffId, pitchIndex: isRest ? undefined : pitchIdx, ...head })
      })
    })

    // x-urile capetelor fiecărei note (un acord cu capete deplasate ocupă mai
    // mult decât linia codiței) — folosite ca să găsim coloana corectă și pe
    // partea dreaptă a acordului, nu doar în jurul codiței
    const noteHeadXs = new Map<string, number[]>()
    for (const h of noteHits) {
      const arr = noteHeadXs.get(h.id)
      if (arr) arr.push(h.x)
      else noteHeadXs.set(h.id, [h.x])
    }

    // click pe un portativ (în afara unei note) -> adăugăm o notă în el;
    // Ctrl/Cmd+click -> bifează portativul pentru redare parțială
    if (svgEl) {
      // Convertește coordonatele ecranului în coordonatele INTERNE ale SVG-ului.
      // VexFlow pune un viewBox; dacă o regulă CSS scalează SVG-ul (lățimea redată
      // ≠ atributul), o simplă scădere `clientY - rect.top` dă pixeli randați, nu
      // coordonate SVG — iar eroarea crește cu Y, mutând click-urile de pe
      // portativul de jos pe cel de sus. getScreenCTM ține cont de scalare/viewBox.
      const clientToSvg = (clientX: number, clientY: number) => {
        const ctm = svgEl.getScreenCTM()
        if (!ctm) {
          const r = svgEl.getBoundingClientRect()
          return { x: clientX - r.left, y: clientY - r.top }
        }
        const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
        return { x: p.x, y: p.y }
      }

      // --- marquee: Shift+drag desenează un dreptunghi care selectează notele
      // dinăuntru (capul lor). La final suprimăm click-ul, ca să nu adauge notă.
      let suppressClick = false
      let marqueeStart: { x: number; y: number } | null = null
      let marqueeRect: SVGRectElement | null = null

      const onMarqueeMove = (e: MouseEvent) => {
        if (!marqueeStart || !marqueeRect) return
        const { x, y } = clientToSvg(e.clientX, e.clientY)
        marqueeRect.setAttribute("x", String(Math.min(x, marqueeStart.x)))
        marqueeRect.setAttribute("y", String(Math.min(y, marqueeStart.y)))
        marqueeRect.setAttribute("width", String(Math.abs(x - marqueeStart.x)))
        marqueeRect.setAttribute("height", String(Math.abs(y - marqueeStart.y)))
      }

      const onMarqueeUp = (e: MouseEvent) => {
        window.removeEventListener("mousemove", onMarqueeMove)
        window.removeEventListener("mouseup", onMarqueeUp)
        const start = marqueeStart
        marqueeRect?.remove()
        marqueeRect = null
        marqueeStart = null
        if (!start) return
        const { x: endX, y: endY } = clientToSvg(e.clientX, e.clientY)
        // sub un prag e de fapt un Shift+click (extinde intervalul) — îl lăsăm să treacă
        if (Math.hypot(endX - start.x, endY - start.y) < 6) return
        suppressClick = true
        const left = Math.min(endX, start.x)
        const right = Math.max(endX, start.x)
        const top = Math.min(endY, start.y)
        const bottom = Math.max(endY, start.y)
        // capetele de notă din dreptunghi, grupate pe portativ (selecția trăiește
        // într-un singur portativ — îl alegem pe cel cu cele mai multe capete)
        const byStaff = new Map<string, Set<string>>()
        for (const h of noteHits) {
          if (h.x < left || h.x > right || h.y < top || h.y > bottom) continue
          if (!byStaff.has(h.staffId)) byStaff.set(h.staffId, new Set())
          byStaff.get(h.staffId)!.add(h.id)
        }
        let best: Set<string> | null = null
        for (const ids of byStaff.values()) {
          if (!best || ids.size > best.size) best = ids
        }
        dispatch({ type: "setSelection", ids: best ? [...best] : [] })
      }

      svgEl.addEventListener("mousedown", (event) => {
        if (!event.shiftKey) return
        // împiedicăm selecția de text a paginii în timpul tragerii
        event.preventDefault()
        marqueeStart = clientToSvg(event.clientX, event.clientY)
        marqueeRect = document.createElementNS(SVG_NS, "rect")
        marqueeRect.setAttribute("x", String(marqueeStart.x))
        marqueeRect.setAttribute("y", String(marqueeStart.y))
        marqueeRect.setAttribute("width", "0")
        marqueeRect.setAttribute("height", "0")
        marqueeRect.setAttribute("fill", "rgba(201, 169, 110, 0.15)")
        marqueeRect.setAttribute("stroke", ACCENT_COLOR)
        marqueeRect.setAttribute("stroke-width", "1")
        marqueeRect.setAttribute("stroke-dasharray", "4 3")
        marqueeRect.setAttribute("pointer-events", "none")
        svgEl.appendChild(marqueeRect)
        window.addEventListener("mousemove", onMarqueeMove)
        window.addEventListener("mouseup", onMarqueeUp)
      })

      svgEl.addEventListener("click", (event) => {
        // click-ul ce încheie un marquee nu trebuie să mai adauge/selecteze nimic
        if (suppressClick) {
          suppressClick = false
          return
        }
        const { x: clickX, y: clickY } = clientToSvg(event.clientX, event.clientY)

        // --- click pe TABLATURĂ: alegi coarda (linia) și adaugi/selectezi ---
        const tabRow = tabRows.find((r) => clickY >= r.topY - 10 && clickY <= r.bottomY + 10)
        if (tabRow) {
          if (event.ctrlKey || event.metaKey) {
            dispatch({ type: "toggleStaffSelection", staffId: tabRow.staffId })
            return
          }
          // coarda cea mai apropiată de click
          let str = 1
          let bestD = Infinity
          tabRow.stringYs.forEach((sy, i) => {
            const d = Math.abs(sy - clickY)
            if (d < bestD) {
              bestD = d
              str = i + 1
            }
          })
          // notă existentă pe această coloană (TAB)? -> o selectăm
          const colHit = tabRendered
            .filter((r) => r.staffId === tabRow.staffId && r.systemIndex === tabRow.systemIndex)
            .map((r) => ({ r, d: Math.abs(r.x - clickX) }))
            .filter((c) => c.d < 14)
            .sort((a, b) => a.d - b.d)[0]?.r
          if (colHit) {
            if (event.altKey) dispatch({ type: "toggleNoteInSelection", id: colHit.id })
            else if (event.shiftKey) dispatch({ type: "extendSelectionTo", id: colHit.id })
            else dispatch({ type: "selectNote", id: colHit.id })
            return
          }
          if (event.shiftKey || event.altKey) return
          if (clickX < contentLeft + headerWidth) return
          // gol pe această coloană -> adăugăm coarda liberă (fret 0) pe coarda apăsată
          const pitch: Pitch = { ...openStringPitch(tabRow.instrument, str), string: str }
          const span = measureSpans.find(
            (m) => m.systemIndex === tabRow.systemIndex && clickX >= m.xStart && clickX < m.xEnd,
          )
          const contentMeasures = staffMeasures.get(tabRow.staffId)?.length ?? 0
          if (span && span.measureIndex >= contentMeasures) {
            const staffObj = staves.find((s) => s.id === tabRow.staffId)
            const contentBeats = staffObj ? staffObj.notes.reduce((sum, n) => sum + entryBeats(n), 0) : 0
            const gapBeats = span.measureIndex * beatsPerMeasure - contentBeats
            dispatch({ type: "addNoteAfterGap", staffId: tabRow.staffId, pitch, gapBeats: Math.max(0, gapBeats) })
            return
          }
          const insertBefore = tabRendered.find(
            (r) =>
              r.staffId === tabRow.staffId &&
              (r.systemIndex > tabRow.systemIndex ||
                (r.systemIndex === tabRow.systemIndex && r.x > clickX + 12)),
          )
          dispatch({ type: "addNoteAtPitch", staffId: tabRow.staffId, pitch, beforeId: insertBefore?.id })
          return
        }

        // ±8px ≈ o treaptă și jumătate în jurul liniilor. Dacă mai multe
        // portative se potrivesc (rar, la suprapunere), îl alegem pe cel mai
        // apropiat pe verticală — altfel un click pe portativul de jos putea
        // nimeri portativul de sus și nota ajungea pe portativul greșit.
        const row = rows
          .filter((r) => clickY >= r.topY - 8 && clickY <= r.bottomY + 8)
          .sort(
            (a, b) =>
              Math.abs(clickY - (a.topY + a.bottomY) / 2) - Math.abs(clickY - (b.topY + b.bottomY) / 2),
          )[0]

        // în afara liniilor portativului, singurele ținte sunt capetele de notă
        // cu linii suplimentare (deasupra/dedesubt) — hit pe bbox-ul glyph-ului.
        // Restrângem la portativul cel mai apropiat pe verticală, ca un click în
        // spațiul dintre portative să NU selecteze o notă de pe celălalt portativ.
        if (!row) {
          let nearestStaffId: string | null = null
          let nearestDist = Infinity
          for (const r of rows) {
            const d = clickY < r.topY ? r.topY - clickY : clickY > r.bottomY ? clickY - r.bottomY : 0
            if (d < nearestDist) {
              nearestDist = d
              nearestStaffId = r.staffId
            }
          }
          const headHit = noteHits
            .filter(
              (h) =>
                h.staffId === nearestStaffId &&
                Math.abs(h.x - clickX) <= h.halfW + 3 &&
                Math.abs(h.y - clickY) <= h.halfH + 2,
            )
            .sort(
              (a, b) =>
                Math.hypot(a.x - clickX, a.y - clickY) - Math.hypot(b.x - clickX, b.y - clickY),
            )[0]
          if (!headHit) {
            // click pe gol (între/în afara portativelor) — revine la „nimic selectat"
            if (selectedId) dispatch({ type: "selectNote", id: null })
            return
          }
          if (event.ctrlKey || event.metaKey) {
            dispatch({ type: "toggleStaffSelection", staffId: headHit.staffId })
          } else if (event.altKey) {
            dispatch({ type: "toggleNoteInSelection", id: headHit.id })
          } else if (event.shiftKey) {
            dispatch({ type: "extendSelectionTo", id: headHit.id })
          } else {
            dispatch({ type: "selectNote", id: headHit.id, pitchIndex: headHit.pitchIndex })
          }
          return
        }

        if (event.ctrlKey || event.metaKey) {
          dispatch({ type: "toggleStaffSelection", staffId: row.staffId })
          return
        }

        // un cap de notă precis (inclusiv capetele deplasate stânga/dreapta ale
        // unui acord, ex. secundele) — selectează exact acea înălțime. Are
        // prioritate înaintea logicii de coloană, care altfel ar rata capetele
        // deplasate și ar insera o notă nouă în loc să le selecteze.
        const headHit = noteHits
          .filter(
            (h) =>
              h.staffId === row.staffId &&
              Math.abs(h.x - clickX) <= h.halfW + 3 &&
              Math.abs(h.y - clickY) <= h.halfH + 2,
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - clickX, a.y - clickY) - Math.hypot(b.x - clickX, b.y - clickY),
          )[0]
        if (headHit) {
          // Alt = comută individual (ne-contiguu), Shift = extinde intervalul,
          // simplu = selectează exact acea înălțime
          if (event.altKey) dispatch({ type: "toggleNoteInSelection", id: headHit.id })
          else if (event.shiftKey) dispatch({ type: "extendSelectionTo", id: headHit.id })
          else dispatch({ type: "selectNote", id: headHit.id, pitchIndex: headHit.pitchIndex })
          return
        }

        // ignorăm zona cheii / armurii / măsurii din stânga primei măsuri
        if (clickX < contentLeft + headerWidth) return

        const pitch = yToPitch(clickY, row.stave, row.clef)

        // pe coloana unei note existente, decizia se ia după treapta quantizată
        // a click-ului (precis pe grila portativului, fără toleranțe de bbox):
        //  - treaptă pe care nota o ARE deja -> selectăm exact acel cap
        //  - treaptă nouă -> o adăugăm la acord
        //  - pauză -> o selectăm
        // ATENȚIE: doar notele de pe ACELAȘI rând (sistem) — x-ul se repetă pe
        // fiecare rând, deci fără filtrul pe systemIndex un click pe portativul
        // din rândul de jos ar nimeri nota de la același x din rândul de sus
        const columnTarget = renderedNotes
          .filter((rn) => rn.staffId === row.staffId && rn.systemIndex === row.systemIndex)
          .map((rn) => {
            const xs = noteHeadXs.get(rn.id) ?? [rn.staveNote.getAbsoluteX()]
            const dist = Math.min(...xs.map((x) => Math.abs(x - clickX)))
            return { rn, dist }
          })
          .filter((c) => c.dist < 14)
          .sort((a, b) => a.dist - b.dist)[0]?.rn
        if (columnTarget) {
          const entry = staves
            .find((s) => s.id === row.staffId)
            ?.notes.find((n) => n.id === columnTarget.id)
          if (entry) {
            // Alt+click comută nota individual în/din selecție (ne-contiguu)
            if (event.altKey) {
              dispatch({ type: "toggleNoteInSelection", id: entry.id })
              return
            }
            // Shift+click extinde selecția până la nota/pauza vizată (indiferent
            // de înălțime), fără să modifice acordul
            if (event.shiftKey) {
              dispatch({ type: "extendSelectionTo", id: entry.id })
              return
            }
            if (entry.type === "rest") {
              dispatch({ type: "selectNote", id: entry.id })
              return
            }
            const pitchIdx = entry.pitches.findIndex(
              (p) => p.step === pitch.step && p.octave === pitch.octave,
            )
            if (pitchIdx >= 0) {
              dispatch({ type: "selectNote", id: entry.id, pitchIndex: pitchIdx })
            } else {
              dispatch({ type: "addPitchToNote", noteId: entry.id, pitch })
            }
            return
          }
        }

        // Shift/Alt+click pe o zonă goală nu inserează nimic (ar fi accidental
        // în timpul construirii unei selecții) — astea acționează doar pe note
        if (event.shiftKey || event.altKey) return

        // dacă s-a dat click DINCOLO de notele portativului (într-o măsură goală
        // de mai târziu), umplem golul cu pauze și punem nota la măsura click-ului
        // — altfel nota s-ar lipi de ultima notă existentă (apărând „mai sus")
        const span = measureSpans.find(
          (m) => m.systemIndex === row.systemIndex && clickX >= m.xStart && clickX < m.xEnd,
        )
        const contentMeasures = staffMeasures.get(row.staffId)?.length ?? 0
        if (span && span.measureIndex >= contentMeasures) {
          const staffObj = staves.find((s) => s.id === row.staffId)
          const contentBeats = staffObj ? staffObj.notes.reduce((sum, n) => sum + entryBeats(n), 0) : 0
          const gapBeats = span.measureIndex * beatsPerMeasure - contentBeats
          dispatch({ type: "addNoteAfterGap", staffId: row.staffId, pitch, gapBeats: Math.max(0, gapBeats) })
          return
        }

        // în interiorul conținutului: inserăm la poziția orizontală a click-ului
        // — înaintea primei note aflate la dreapta lui (comparat pe rând + x,
        // fiindcă x se repetă pe rânduri); fără una, nota se adaugă la final
        const insertBefore = renderedNotes.find(
          (rn) =>
            rn.staffId === row.staffId &&
            (rn.systemIndex > row.systemIndex ||
              (rn.systemIndex === row.systemIndex && rn.staveNote.getAbsoluteX() > clickX + 12)),
        )
        dispatch({ type: "addNoteAtPitch", staffId: row.staffId, pitch, beforeId: insertBefore?.id })
      })
    }

    // restaurăm pozițiile de scroll salvate înainte de redesenare (vezi mai sus)
    if (scroller && scroller.scrollTop !== savedScrollTop) {
      scroller.scrollTop = savedScrollTop
    }
    if (container.scrollLeft !== savedScrollLeft) {
      container.scrollLeft = savedScrollLeft
    }
  }, [staves, activeStaffId, selectedStaffIds, timeSignature, selectedId, selectedIds, selectedPitchIndex, viewMode, lyricMode, dispatch])

  useEffect(() => {
    draw()
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  // în modul Versuri, input-ul plutitor urmărește nota SELECTATĂ: îi încarcă
  // silaba curentă, îl poziționează sub notă (din chenarul real al elementului
  // SVG — ține cont de scroll/scalare) și îi dă focus. Repoziționăm la scroll/
  // resize. Sincronizările de stare stau într-o funcție imbricată (`sync`),
  // nu direct în corpul efectului (regula react-hooks/set-state-in-effect).
  useLayoutEffect(() => {
    if (!lyricMode || !selectedId) return
    const staff = staves.find((s) => s.notes.some((n) => n.id === selectedId))
    const entry = staff?.notes.find((n) => n.id === selectedId)
    if (!staff || !entry || entry.type !== "note") return
    const reposition = () => {
      const svg = containerRef.current?.querySelector("svg")
      const wrap = wrapperRef.current
      const meta = noteMetaRef.current.get(selectedId)
      const ctm = svg?.getScreenCTM()
      if (!svg || !wrap || !meta || !ctm) return
      // aceeași linie de bază ca silaba desenată (coordonate SVG), ca input-ul să
      // apară EXACT unde va fi textul; convertim în coordonatele wrapper-ului
      const bottomY = rowBottomRef.current.get(`${staff.id}:${meta.systemIndex}`)
      if (bottomY === undefined) return
      const pt = new DOMPoint(meta.x + 5, bottomY + LYRIC_OFFSET).matrixTransform(ctm)
      const w = wrap.getBoundingClientRect()
      // input-ul are translateX(-50%); ridicăm puțin (top) ca textul să cadă pe linie
      setLyricPos({ left: pt.x - w.left, top: pt.y - w.top - 11 })
    }
    const sync = () => {
      setLyricText(entry.lyric ?? "")
      reposition()
      lyricInputRef.current?.focus()
    }
    sync()
    const scroller = containerRef.current
    scroller?.addEventListener("scroll", reposition)
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      scroller?.removeEventListener("scroll", reposition)
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
  }, [lyricMode, selectedId, staves])

  // evidențierea notei curente în timpul redării: recolorăm direct elementele
  // SVG ale notei și mișcăm cursorul vertical — fără dispatch / re-randare React
  // (vezi lib/audio/playbackHighlight)
  useEffect(() => {
    const unsubscribe = onPlaybackHighlight((noteId, durationSeconds) => {
      // restaurăm exact atributele notei evidențiate anterior
      for (const { el, fill, stroke } of highlightRestoreRef.current) {
        if (fill === null) el.removeAttribute("fill")
        else el.setAttribute("fill", fill)
        if (stroke === null) el.removeAttribute("stroke")
        else el.setAttribute("stroke", stroke)
      }
      highlightRestoreRef.current = []

      // oprim alunecarea curentă — fie repornim spre noua țintă, fie ascundem
      if (cursorAnimRef.current !== null) {
        cancelAnimationFrame(cursorAnimRef.current)
        cursorAnimRef.current = null
      }

      const cursor = cursorElRef.current
      if (noteId === null) {
        cursor?.setAttribute("visibility", "hidden")
        cursorSystemRef.current = -1
        return
      }

      const group = svgNoteElsRef.current.get(noteId)
      if (group) {
        // recolorăm doar elementele care chiar au fill/stroke (păstrăm "none")
        const targets: Element[] = [group, ...group.querySelectorAll("*")]
        for (const el of targets) {
          const fill = el.getAttribute("fill")
          const stroke = el.getAttribute("stroke")
          const paintsFill = fill !== null && fill !== "none"
          const paintsStroke = stroke !== null && stroke !== "none"
          if (!paintsFill && !paintsStroke) continue
          highlightRestoreRef.current.push({ el, fill, stroke })
          if (paintsFill) el.setAttribute("fill", ACCENT_COLOR)
          if (paintsStroke) el.setAttribute("stroke", ACCENT_COLOR)
        }
      }

      // --- cursorul vertical: poziționare + alunecare spre nota următoare ---
      const meta = noteMetaRef.current.get(noteId)
      const layout = cursorLayoutRef.current
      if (!cursor || !meta || !layout) return
      const system = layout.systems[meta.systemIndex]
      if (!system) return

      cursor.setAttribute("y", String(system.top))
      cursor.setAttribute("height", String(system.bottom - system.top))
      cursor.setAttribute("x", String(meta.x))
      cursor.setAttribute("visibility", "visible")

      // la schimbarea rândului, centrăm rândul curent în fereastră — scroll-ul
      // urmărește bara în jos prin pagină, rând cu rând
      if (cursorSystemRef.current !== meta.systemIndex) {
        cursorSystemRef.current = meta.systemIndex
        cursor.scrollIntoView({ block: "center", behavior: "smooth" })
      }

      // în vizualizarea continuă containerul derulează orizontal: ținem cursorul
      // "ancorat" spre stânga ferestrei și derulăm continuu odată cu el, cadru cu
      // cadru (panoramare ca în MuseScore); în modul pagină e no-op (nu există
      // depășire orizontală)
      const followCursorH = (x: number) => {
        const hScroller = containerRef.current
        if (!hScroller || hScroller.scrollWidth <= hScroller.clientWidth) return
        const anchor = Math.min(200, hScroller.clientWidth / 3)
        hScroller.scrollLeft = Math.max(0, x - anchor)
      }
      followCursorH(meta.x)

      // ținta alunecării: nota următoare de pe același rând; dacă următoarea e
      // pe alt rând, alunecăm până la marginea dreaptă (apoi sărim cu nota nouă)
      const startX = meta.x
      let endX = startX
      if (meta.nextId) {
        const next = noteMetaRef.current.get(meta.nextId)
        if (next) endX = next.systemIndex === meta.systemIndex ? next.x : layout.rightEdge
      }
      if (endX <= startX || !durationSeconds || durationSeconds <= 0) return

      const startedAt = performance.now()
      const slide = (now: number) => {
        const progress = Math.min((now - startedAt) / (durationSeconds * 1000), 1)
        const x = startX + (endX - startX) * progress
        cursor.setAttribute("x", String(x))
        followCursorH(x)
        cursorAnimRef.current = progress < 1 ? requestAnimationFrame(slide) : null
      }
      cursorAnimRef.current = requestAnimationFrame(slide)
    })

    return () => {
      unsubscribe()
      if (cursorAnimRef.current !== null) cancelAnimationFrame(cursorAnimRef.current)
    }
  }, [])

  // audiția la editare (ca în MuseScore): când selecția sau înălțimile notei
  // selectate se schimbă (selectare, ↑/↓, alterații, acord nou), o auzi scurt.
  // Cheia de deduplicare evită re-redarea la modificări neauzibile (durată etc.);
  // în timpul redării selecția e goală, deci audiția tace de la sine.
  const auditionKeyRef = useRef("")
  const auditionTimerRef = useRef<number | null>(null)
  useEffect(() => {
    const staff = staves.find((s) => s.notes.some((n) => n.id === selectedId))
    const entry = staff?.notes.find((n) => n.id === selectedId)
    if (!staff || !entry || entry.type !== "note") {
      // nimic de audiat (deselectat / pauză) — anulăm audiția programată
      if (auditionTimerRef.current !== null) window.clearTimeout(auditionTimerRef.current)
      auditionKeyRef.current = selectedId ?? ""
      return
    }
    const pitches =
      selectedPitchIndex !== null && entry.pitches[selectedPitchIndex]
        ? [entry.pitches[selectedPitchIndex]]
        : entry.pitches
    const key = `${selectedId}|${selectedPitchIndex ?? "all"}|${pitches
      .map((p) => `${p.step}${p.accidental ?? ""}${p.octave}`)
      .join(",")}`
    if (key === auditionKeyRef.current) return
    auditionKeyRef.current = key
    // amânare scurtă (debounce): la navigare/scroll rapid prin note, cele
    // intermediare NU se aud — sună doar nota pe care te oprești (preview scurt fix)
    if (auditionTimerRef.current !== null) window.clearTimeout(auditionTimerRef.current)
    auditionTimerRef.current = window.setTimeout(() => {
      void auditionPitches(staff.instrument, staff.keySignature, pitches)
    }, 70)
    return () => {
      if (auditionTimerRef.current !== null) window.clearTimeout(auditionTimerRef.current)
    }
  }, [selectedId, selectedPitchIndex, staves])

  // navigare/editare din tastatură (vezi indicațiile de sub portativ)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return
      }

      const hasModifier = event.metaKey || event.ctrlKey || event.altKey

      // Ctrl+Z / Ctrl+Y (sau Ctrl+Shift+Z) — anulează / refă
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase()
        if (key === "z" && !event.shiftKey) {
          event.preventDefault()
          dispatch({ type: "undo" })
          return
        }
        if (key === "y" || (key === "z" && event.shiftKey)) {
          event.preventDefault()
          dispatch({ type: "redo" })
          return
        }

        // Ctrl+C / Ctrl+X — copiază/taie selecția (notele păstrate în ordinea
        // din portativ); Ctrl+V — lipește după selecția curentă
        if ((key === "c" || key === "x") && !event.shiftKey) {
          const { staves, selectedIds, selectedId } = selectionRef.current
          const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
          const idSet = new Set(ids)
          const staff = ids.length ? staves.find((s) => s.notes.some((n) => idSet.has(n.id))) : undefined
          if (staff) {
            event.preventDefault()
            clipboardRef.current = staff.notes.filter((n) => idSet.has(n.id))
            if (key === "x") dispatch({ type: "deleteSelected" })
          }
          return
        }
        if (key === "v" && !event.shiftKey) {
          if (clipboardRef.current.length > 0) {
            event.preventDefault()
            dispatch({ type: "pasteNotes", entries: clipboardRef.current })
          }
          return
        }
        // Ctrl+3 — transformă nota selectată într-un triolet (ca în MuseScore)
        if (key === "3") {
          event.preventDefault()
          dispatch({ type: "makeTriplet" })
          return
        }
      }

      // Escape — revine la „nimic selectat" (și iese din modul N). Important:
      // inserarea din tastatură (Enter / literele din modul N) se face mereu
      // DUPĂ nota selectată, deci fără deselectare nu puteai adăuga liber la
      // finalul portativului.
      if (event.key === "Escape" && !hasModifier) {
        event.preventDefault()
        setNoteInputMode(false)
        dispatch({ type: "selectNote", id: null })
        dispatch({ type: "clearStaffSelection" })
        return
      }

      // Space — redă contextual; a doua apăsare oprește:
      //  • note selectate -> doar ele
      //  • portativ(e) bifat(e) pentru redare parțială -> doar acelea
      //  • nimic -> toată piesa
      if (event.key === " " && !hasModifier) {
        event.preventDefault()
        if (player.isPlaying) {
          player.stop()
          emitPlaybackHighlight(null)
          setIsPlaying(false)
          return
        }
        // citim selecția DIRECT (nu din ref) ca să fie mereu la zi
        const bpm = playbackQuarterBpm(meta.tempo, meta.tempoBeat, meta.tempoBeatDotted, playbackRate)
        const noteIds = selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
        let parts: { notes: NoteEntry[]; keySignature: string; instrument: string; volume: number; muted: boolean }[]
        let highlightPartIndex: number
        if (noteIds.length > 0) {
          // doar notele selectate (păstrăm selecția aurie) — grupate pe portativ,
          // ca segmentele de pe instrumente diferite să sune împreună (de la timpul 0)
          const idSet = new Set(noteIds)
          const playedStaves = staves.filter((s) => s.notes.some((n) => idSet.has(n.id)))
          if (playedStaves.length === 0) return
          parts = playedStaves.map((s) => ({
            notes: s.notes.filter((n) => idSet.has(n.id)),
            keySignature: s.keySignature,
            instrument: s.instrument,
            volume: mixer[s.id]?.volume ?? 1,
            muted: mixer[s.id]?.muted ?? false,
          }))
          const headIdx = playedStaves.findIndex((s) => s.notes.some((n) => n.id === selectedId))
          highlightPartIndex = headIdx >= 0 ? headIdx : 0
        } else {
          // portativele bifate (Ctrl+click) sau, fără bifare, toate
          const played = selectedStaffIds.length
            ? staves.filter((s) => selectedStaffIds.includes(s.id))
            : staves
          if (played.length === 0) return
          parts = played.map((s) => ({
            notes: s.notes,
            keySignature: s.keySignature,
            instrument: s.instrument,
            volume: mixer[s.id]?.volume ?? 1,
            muted: mixer[s.id]?.muted ?? false,
          }))
          const activeAmong = played.findIndex((s) => s.id === activeStaffId)
          highlightPartIndex = activeAmong >= 0 ? activeAmong : 0
        }
        setIsPlaying(true)
        void player.play(parts, bpm, {
          highlightPartIndex,
          onNote: (id, durationSeconds) => emitPlaybackHighlight(id, durationSeconds),
          onEnd: () => {
            emitPlaybackHighlight(null)
            setIsPlaying(false)
          },
        })
        return
      }

      // N comută modul de introducere a notelor din tastatură (ca în MuseScore)
      if (event.key.toLowerCase() === "n" && !hasModifier) {
        event.preventDefault()
        setLyricMode(false)
        setNoteInputMode((mode) => !mode)
        return
      }

      // M comută modul Versuri: scrii silaba sub nota selectată. Cât timp input-ul
      // de versuri are focus, tastatura globală nu prinde (target = INPUT), deci nu
      // există conflict cu shortcut-urile; ieșirea se face din câmp cu Esc. Aici
      // doar INTRĂM în mod (input-ul nu e încă focusat). Modurile N și M se exclud.
      if (event.key.toLowerCase() === "m" && !hasModifier) {
        event.preventDefault()
        if (lyricMode) {
          setLyricMode(false)
          return
        }
        setNoteInputMode(false)
        setLyricMode(true)
        // dacă nu e selectată o notă, ne mutăm pe prima notă a portativului activ
        const staff = staves.find((s) => s.notes.some((n) => n.id === selectedId)) ?? staves.find((s) => s.id === activeStaffId)
        const onNote = staff?.notes.some((n) => n.id === selectedId && n.type === "note")
        if (!onNote) {
          const first = staff?.notes.find((n) => n.type === "note")
          if (first) dispatch({ type: "selectNote", id: first.id })
        }
        return
      }

      // în TAB: tastele 0–9 setează fret-ul notei selectate (pe coarda ei),
      // cu două cifre tastate rapid pentru fret-uri 10–24 (ca în MuseScore)
      if (!noteInputMode && !hasModifier && /^[0-9]$/.test(event.key)) {
        const sel = selectionRef.current
        const staff = sel.staves.find((s) => s.notes.some((n) => n.id === sel.selectedId))
        const display = staff && supportsTab(staff.instrument) ? staff.display ?? "notation" : "notation"
        if (sel.selectedId && (display === "tab" || display === "both")) {
          event.preventDefault()
          const now = performance.now()
          const buf = fretBufferRef.current
          let digits = event.key
          if (now - buf.ts < 900 && buf.digits.length > 0 && Number(buf.digits + event.key) <= 24) {
            digits = buf.digits + event.key
          }
          fretBufferRef.current = { ts: now, digits }
          dispatch({ type: "setFret", fret: Number(digits) })
          return
        }
      }

      // P comută intrarea selectată între notă și pauză (păstrând durata și,
      // la revenire, înălțimile/acordul) — merge în ambele moduri
      if (event.key.toLowerCase() === "p" && !hasModifier) {
        event.preventDefault()
        dispatch({ type: "toggleRest" })
        return
      }

      // în modul de introducere, literele C–B devin note — duratele se aleg cu
      // cifrele 1–5, pauza cu 0 (literele Q W E R T / A S D F G sunt ocupate)
      if (noteInputMode && !hasModifier) {
        const step = NOTE_KEYS[event.key.toLowerCase()]
        if (step) {
          event.preventDefault()
          dispatch({ type: "insertNoteWithStep", step })
          return
        }
        if (event.key === "0") {
          event.preventDefault()
          dispatch({ type: "insertRest", duration: selectedDuration })
          return
        }
        const digitDuration = DIGIT_DURATIONS[event.key]
        if (digitDuration) {
          event.preventDefault()
          dispatch({ type: "setDuration", duration: digitDuration })
          return
        }
        // Q deselectează FĂRĂ a ieși din modul N (Esc iese de tot) — ca să poți
        // introduce note la finalul portativului fără a părăsi introducerea
        if (event.key.toLowerCase() === "q") {
          event.preventDefault()
          dispatch({ type: "selectNote", id: null })
          return
        }
        // celelalte litere de comenzi din modul normal nu fac nimic aici
        if (/^[a-z]$/.test(event.key.toLowerCase()) && event.key.toLowerCase() !== "l") {
          return
        }
      }

      if (!noteInputMode) {
        const hotkeyDuration = DURATION_HOTKEYS[event.key.toLowerCase()]
        if (hotkeyDuration && !hasModifier) {
          event.preventDefault()
          dispatch({ type: "setDuration", duration: hotkeyDuration })
          return
        }
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        const direction = event.key === "ArrowRight" ? "next" : "prev"
        // Shift+←/→ extinde intervalul; fără Shift, mută selecția simplă
        dispatch(event.shiftKey ? { type: "extendSelection", direction } : { type: "moveSelection", direction })
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        dispatch({ type: "insertNote" })
        return
      }

      if (!noteInputMode) {
        const restDuration = REST_HOTKEYS[event.key.toLowerCase()]
        if (restDuration && !hasModifier) {
          event.preventDefault()
          dispatch({ type: "insertRest", duration: restDuration })
          return
        }
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

      // . -> punct de prelungire pe intrarea selectată (comutator)
      if (event.key === "." && !hasModifier) {
        event.preventDefault()
        dispatch({ type: "toggleDot" })
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
  }, [
    selectedId,
    selectedIds,
    selectedStaffIds,
    staves,
    activeStaffId,
    selectedDuration,
    noteInputMode,
    lyricMode,
    mixer,
    meta.tempo,
    meta.tempoBeat,
    meta.tempoBeatDotted,
    playbackRate,
    player,
    setIsPlaying,
    dispatch,
  ])

  // --- versuri (modul M): salvare + navigare între note ---
  // intrarea selectată acum (input-ul de versuri apare doar dacă e o notă)
  const lyricEntry = staves
    .find((s) => s.notes.some((n) => n.id === selectedId))
    ?.notes.find((n) => n.id === selectedId)
  const lyricActive = lyricMode && !!lyricEntry && lyricEntry.type === "note"

  function commitLyric() {
    // setLyric ignoră pauzele și no-op-urile, deci e ieftin de chemat oricând
    if (selectedId) dispatch({ type: "setLyric", id: selectedId, text: lyricText })
  }
  function moveToAdjacentNote(direction: "next" | "prev") {
    const staff = staves.find((s) => s.notes.some((n) => n.id === selectedId)) ?? staves.find((s) => s.id === activeStaffId)
    if (!staff) return
    const idx = staff.notes.findIndex((n) => n.id === selectedId)
    // sărim pauzele — versurile se pun doar pe note
    let j = -1
    if (direction === "next") {
      for (let i = idx + 1; i < staff.notes.length; i++) if (staff.notes[i].type === "note") { j = i; break }
    } else {
      for (let i = idx - 1; i >= 0; i--) if (staff.notes[i].type === "note") { j = i; break }
    }
    if (j >= 0) dispatch({ type: "selectNote", id: staff.notes[j].id })
  }
  function advanceLyric(direction: "next" | "prev") {
    commitLyric()
    moveToAdjacentNote(direction)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* wrapper relativ: input-ul de versuri plutește peste containerul SVG */}
      <div ref={wrapperRef} className="relative w-full">
        {/* overflow-x: în vizualizarea continuă SVG-ul e mai lat decât containerul */}
        <div ref={containerRef} className="w-full overflow-x-auto" />
        {lyricActive && lyricPos && (
          <input
            ref={lyricInputRef}
            autoFocus
            value={lyricText}
            onChange={(e) => setLyricText(e.target.value)}
            onBlur={commitLyric}
            onKeyDown={(e) => {
              // Space/Tab -> salvează și treci la nota următoare (Shift+Tab înapoi);
              // Enter/Esc -> salvează silaba sub notă și ies din modul Versuri
              // (rămâi pe nota curentă). ←/→ rămân navigare în text (cursorul din
              // silabă), ca în MuseScore.
              if (e.key === " ") {
                e.preventDefault()
                advanceLyric("next")
              } else if (e.key === "Tab") {
                e.preventDefault()
                advanceLyric(e.shiftKey ? "prev" : "next")
              } else if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault()
                commitLyric()
                setLyricMode(false)
              }
            }}
            className="absolute z-10 w-24 -translate-x-1/2 rounded-sm border border-primary bg-surface px-1 py-0.5 text-center text-xs outline-none"
            // nota editată e cea selectată -> text auriu, ca pe foaie (vezi randarea SVG)
            style={{ left: lyricPos.left, top: lyricPos.top, color: ACCENT_COLOR, caretColor: ACCENT_COLOR }}
            placeholder="versuri…"
          />
        )}
      </div>
      {lyricMode ? (
        <p className="px-1 text-xs">
          <span className="rounded-sm bg-primary/20 px-1.5 py-0.5 font-medium text-primary">
            ● Versuri
          </span>{" "}
          <span className="text-foreground-muted">
            Scrie silaba sub nota selectată ·{" "}
            <span className="text-foreground">Space / Tab</span> nota următoare ·{" "}
            <span className="text-foreground">Shift+Tab</span> nota anterioară · Click pe o notă o alege ·{" "}
            <span className="text-foreground">Enter / Esc / M</span> termină (păstrează silaba)
          </span>
        </p>
      ) : noteInputMode ? (
        <p className="px-1 text-xs">
          <span className="rounded-sm bg-primary/20 px-1.5 py-0.5 font-medium text-primary">
            ● Introducere note
          </span>{" "}
          <span className="text-foreground-muted">
            <span className="text-foreground">C D E F G A B</span> introduc nota (octava cea mai apropiată) ·{" "}
            <span className="text-foreground">0</span> pauză · <span className="text-foreground">1–5</span> durata
            (întreagă → șaisprezecime) · <span className="text-foreground">.</span> punct ·{" "}
            <span className="text-foreground">[ ] \</span> alterație ·{" "}
            <span className="text-foreground">↑ / ↓</span> ajustează înălțimea ·{" "}
            <span className="text-foreground">Q</span> deselectează (adaugi la final) ·{" "}
            <span className="text-foreground">N / Esc</span> ieșire
          </span>
        </p>
      ) : (
        <p className="px-1 text-xs text-foreground-muted">
          <span className="text-foreground">N</span> introducere note din tastatură · Click pe un portativ — adaugă o
          notă (devine activ) · Click pe o notă — o selectează ·{" "}
          <span className="text-foreground">← / →</span> circulă între note ·{" "}
          <span className="text-foreground">↑ / ↓</span> schimbă înălțimea ·{" "}
          <span className="text-foreground">Q W E R T</span> durata ·{" "}
          <span className="text-foreground">Enter</span> notă nouă ·{" "}
          <span className="text-foreground">A S D F G</span> pauză ·{" "}
          <span className="text-foreground">[ ] \</span> alterație ·{" "}
          <span className="text-foreground">.</span> punct ·{" "}
          <span className="text-foreground">P</span> notă ↔ pauză ·{" "}
          <span className="text-foreground">L</span> legato ·{" "}
          <span className="text-foreground">Ctrl+3</span> triolet ·{" "}
          <span className="text-foreground">M</span> versuri ·{" "}
          <span className="text-foreground">Delete</span> șterge ·{" "}
          <span className="text-foreground">Space</span> redă (selecția / portativul bifat / tot) ·{" "}
          <span className="text-foreground">Esc</span> deselectează (adaugi liber la final) ·{" "}
          <span className="text-foreground">Shift+click</span> / <span className="text-foreground">Shift+←→</span>{" "}
          / <span className="text-foreground">Shift+drag</span> selectează un interval ·{" "}
          <span className="text-foreground">Alt+click</span> adaugă/scoate o notă ·{" "}
          <span className="text-foreground">Ctrl+C / X / V</span> copiază / taie / lipește ·{" "}
          <span className="text-foreground">Ctrl+click pe portativ</span> îl bifează pentru redare parțială
        </p>
      )}
    </div>
  )
}
