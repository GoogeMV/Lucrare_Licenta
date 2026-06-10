import type {
  Accidental,
  Articulation,
  Clef,
  Duration,
  KeySignature,
  NoteEntry,
  Pitch,
  Staff,
  Step,
  TimeSignature,
} from "@/types/score"
import { nearestPitchWithStep, pitchIndex, stepDown, stepUp } from "@/lib/notation/pitch"
import { clefsForInstrument } from "@/lib/notation/instrument"

/**
 * Generatoare de id-uri (efecte secundare, nu funcții pure) — centralizate aici
 * ca tot ce ține de modelul partiturii să trăiască într-un singur loc.
 */
let idCounter = 0
export function nextId() {
  idCounter += 1
  return `note-${idCounter}`
}

let staffCounter = 0
export function nextStaffId() {
  staffCounter += 1
  return `staff-${staffCounter}`
}

let groupCounter = 0
function nextGroupId() {
  groupCounter += 1
  return `group-${groupCounter}`
}

/**
 * La încărcarea unei partituri salvate, contoarele trebuie aduse peste
 * id-urile existente — altfel notele/portativele noi ar primi id-uri duplicate.
 */
function syncIdCounters(staves: Staff[]) {
  const bump = (id: string | undefined, prefix: string, current: number): number => {
    if (!id || !id.startsWith(prefix)) return current
    const n = Number(id.slice(prefix.length))
    return Number.isFinite(n) ? Math.max(current, n) : current
  }
  for (const staff of staves) {
    staffCounter = bump(staff.id, "staff-", staffCounter)
    groupCounter = bump(staff.groupId, "group-", groupCounter)
    for (const note of staff.notes) {
      idCounter = bump(note.id, "note-", idCounter)
    }
  }
}

/** Înălțimea implicită: poziția pe linia de mijloc (b/4), folosită pentru pauze
 *  și ca punct de pornire când inserăm o notă fără un context anterior. */
export const DEFAULT_PITCH: Pitch = { step: "B", octave: 4 }

/** O melodie scurtă de pornire, ca pagina să nu fie goală la prima deschidere. */
const INITIAL_NOTES: NoteEntry[] = [
  { id: nextId(), type: "note", pitches: [{ step: "G", octave: 4 }], duration: "quarter" },
  { id: nextId(), type: "note", pitches: [{ step: "B", octave: 4 }], duration: "quarter" },
  { id: nextId(), type: "note", pitches: [{ step: "D", octave: 5 }], duration: "quarter" },
  { id: nextId(), type: "note", pitches: [{ step: "C", octave: 5 }], duration: "quarter" },
  { id: nextId(), type: "note", pitches: [{ step: "E", octave: 5 }], duration: "half" },
  { id: nextId(), type: "note", pitches: [{ step: "G", octave: 4 }], duration: "quarter" },
  { id: nextId(), type: "note", pitches: [{ step: "F", octave: 4 }], duration: "eighth" },
  { id: nextId(), type: "note", pitches: [{ step: "G", octave: 4 }], duration: "eighth" },
  { id: nextId(), type: "note", pitches: [{ step: "A", octave: 4 }], duration: "quarter" },
]

const INITIAL_STAFF: Staff = {
  id: nextStaffId(),
  instrument: "Vioară",
  clef: "treble",
  keySignature: "C",
  notes: INITIAL_NOTES,
  slurs: [],
}

export interface ScoreState {
  /** Portativele (liniile de instrument) ale partiturii, de sus în jos */
  staves: Staff[]
  /** Portativul activ — primește notele noi adăugate din toolbar/Enter etc. */
  activeStaffId: string
  /** Portativele bifate pentru redare parțială (Ctrl+click). Gol = redă toate. */
  selectedStaffIds: string[]
  /** Indicația de măsură (ex. 4/4) — comună tuturor portativelor (păstrează alinierea) */
  timeSignature: TimeSignature
  /** Nota selectată curent (id global, în orice portativ) sau `null` */
  selectedId: string | null
  /**
   * Înălțimea selectată din acord (indice în `pitches`), sau `null` = toată
   * intrarea. Setată de click-ul pe un cap de notă; Delete/↑↓/alterațiile
   * acționează doar pe acea înălțime când e setată.
   */
  selectedPitchIndex: number | null
  /** Durata curentă de input — folosită la adăugarea/inserarea de note noi */
  selectedDuration: Duration
}

export type ScoreAction =
  | { type: "selectNote"; id: string | null; pitchIndex?: number }
  | { type: "moveSelection"; direction: "prev" | "next" }
  | { type: "addNoteAtPitch"; staffId: string; pitch: Pitch; beforeId?: string }
  | { type: "addPitchToNote"; noteId: string; pitch: Pitch }
  | { type: "insertNote" }
  | { type: "insertNoteWithStep"; step: Step }
  | { type: "insertRest"; duration: Duration }
  | { type: "setDuration"; duration: Duration }
  | { type: "transposeSelected"; direction: "up" | "down" }
  | { type: "toggleAccidental"; accidental: Accidental }
  | { type: "toggleArticulation"; articulation: Articulation }
  | { type: "toggleDot" }
  | { type: "toggleRest" }
  | { type: "toggleSlur" }
  | { type: "setKeySignature"; keySignature: KeySignature }
  | { type: "setClef"; clef: Clef }
  | { type: "setTimeSignature"; timeSignature: TimeSignature }
  | { type: "addStaff"; instrument: string }
  | { type: "removeStaff"; staffId: string }
  | { type: "setActiveStaff"; staffId: string }
  | { type: "toggleStaffSelection"; staffId: string }
  | { type: "deleteSelected" }
  | { type: "loadScore"; staves: Staff[]; timeSignature: TimeSignature }
  | { type: "newScore" }

export const initialScoreState: ScoreState = {
  staves: [INITIAL_STAFF],
  activeStaffId: INITIAL_STAFF.id,
  selectedStaffIds: [],
  timeSignature: { numerator: 4, denominator: 4 },
  selectedId: null,
  selectedPitchIndex: null,
  selectedDuration: "quarter",
}

// --- helperi pentru a țintui portativul corect ---

function activeStaff(state: ScoreState): Staff {
  return state.staves.find((s) => s.id === state.activeStaffId) ?? state.staves[0]
}

/** Portativul care conține nota cu id-ul dat (sau `undefined`) */
function staffOfNote(state: ScoreState, id: string | null): Staff | undefined {
  if (!id) return undefined
  return state.staves.find((s) => s.notes.some((n) => n.id === id))
}

/** Înlocuiește un portativ după id, printr-o funcție de transformare */
function updateStaff(state: ScoreState, staffId: string, fn: (s: Staff) => Staff): ScoreState {
  return { ...state, staves: state.staves.map((s) => (s.id === staffId ? fn(s) : s)) }
}

/** Transformă doar nota cu id-ul dat, în portativul care o conține */
function updateNote(state: ScoreState, id: string, fn: (n: NoteEntry) => NoteEntry): ScoreState {
  const staff = staffOfNote(state, id)
  if (!staff) return state
  return updateStaff(state, staff.id, (s) => ({
    ...s,
    notes: s.notes.map((n) => (n.id === id ? fn(n) : n)),
  }))
}

/** Inserează o intrare în portativul activ, după nota selectată (sau la final) */
function insertInActiveStaff(state: ScoreState, entry: NoteEntry): ScoreState {
  const staff = activeStaff(state)
  const selIndex = staff.notes.findIndex((n) => n.id === state.selectedId)
  const insertAt = selIndex >= 0 ? selIndex + 1 : staff.notes.length
  const notes = [...staff.notes]
  notes.splice(insertAt, 0, entry)
  return { ...updateStaff(state, staff.id, (s) => ({ ...s, notes })), selectedId: entry.id, selectedPitchIndex: null }
}

export function scoreReducer(state: ScoreState, action: ScoreAction): ScoreState {
  switch (action.type) {
    case "selectNote": {
      // selectarea unei note face activ portativul care o conține
      const staff = staffOfNote(state, action.id)
      return { ...state, selectedId: action.id, selectedPitchIndex: action.pitchIndex ?? null, activeStaffId: staff?.id ?? state.activeStaffId }
    }

    case "moveSelection": {
      const staff = staffOfNote(state, state.selectedId) ?? activeStaff(state)
      if (staff.notes.length === 0) return state
      const current = staff.notes.findIndex((n) => n.id === state.selectedId)
      const next =
        action.direction === "next"
          ? current < 0
            ? 0
            : Math.min(current + 1, staff.notes.length - 1)
          : current < 0
            ? staff.notes.length - 1
            : Math.max(current - 1, 0)
      return { ...state, selectedId: staff.notes[next].id, selectedPitchIndex: null, activeStaffId: staff.id }
    }

    case "addNoteAtPitch": {
      const entry: NoteEntry = {
        id: nextId(),
        type: "note",
        pitches: [action.pitch],
        duration: state.selectedDuration,
      }
      // cu `beforeId`, nota intră ÎNAINTEA notei respective (click între note /
      // în fața primei note); fără, se adaugă la final
      const next = updateStaff(state, action.staffId, (s) => {
        const at = action.beforeId ? s.notes.findIndex((n) => n.id === action.beforeId) : -1
        const notes = [...s.notes]
        notes.splice(at >= 0 ? at : notes.length, 0, entry)
        return { ...s, notes }
      })
      return { ...next, activeStaffId: action.staffId, selectedId: entry.id, selectedPitchIndex: null }
    }

    case "addPitchToNote": {
      // adaugă o înălțime la o notă existentă → acord (sortat ascendent);
      // dublurile sunt ignorate. Pauzele nu devin acorduri.
      const staff = staffOfNote(state, action.noteId)
      if (!staff) return state
      const next = updateNote(state, action.noteId, (n) => {
        if (n.type !== "note") return n
        const exists = n.pitches.some(
          (p) => p.step === action.pitch.step && p.octave === action.pitch.octave,
        )
        if (exists) return n
        const pitches = [...n.pitches, action.pitch].sort((a, b) => pitchIndex(a) - pitchIndex(b))
        return { ...n, pitches }
      })
      return { ...next, activeStaffId: staff.id, selectedId: action.noteId, selectedPitchIndex: null }
    }

    case "insertNote": {
      const staff = activeStaff(state)
      const selIndex = staff.notes.findIndex((n) => n.id === state.selectedId)
      // păstrăm înălțimile intrării selectate (inclusiv acordul întreg) ca punct de pornire
      const basePitches = selIndex >= 0 ? staff.notes[selIndex].pitches : [DEFAULT_PITCH]
      const entry: NoteEntry = {
        id: nextId(),
        type: "note",
        pitches: basePitches.map((p) => ({ ...p })),
        duration: state.selectedDuration,
      }
      return insertInActiveStaff(state, entry)
    }

    case "insertNoteWithStep": {
      // introducere din tastatură (litera C–B): octava se alege cât mai aproape
      // de ultima notă dinaintea punctului de inserare (ca în MuseScore)
      const staff = activeStaff(state)
      const selIndex = staff.notes.findIndex((n) => n.id === state.selectedId)
      const insertAt = selIndex >= 0 ? selIndex + 1 : staff.notes.length
      let reference = DEFAULT_PITCH
      for (let i = insertAt - 1; i >= 0; i--) {
        if (staff.notes[i].type === "note") {
          reference = staff.notes[i].pitches[0]
          break
        }
      }
      const entry: NoteEntry = {
        id: nextId(),
        type: "note",
        pitches: [nearestPitchWithStep(reference, action.step)],
        duration: state.selectedDuration,
      }
      return insertInActiveStaff(state, entry)
    }

    case "insertRest": {
      const entry: NoteEntry = {
        id: nextId(),
        type: "rest",
        pitches: [DEFAULT_PITCH],
        duration: action.duration,
      }
      return insertInActiveStaff(state, entry)
    }

    case "setDuration": {
      if (!state.selectedId) return { ...state, selectedDuration: action.duration }
      return {
        ...updateNote(state, state.selectedId, (n) => ({ ...n, duration: action.duration })),
        selectedDuration: action.duration,
      }
    }

    case "transposeSelected": {
      if (!state.selectedId) return state
      const move = action.direction === "up" ? stepUp : stepDown
      // cu o înălțime selectată din acord, doar ea se mută (re-sortăm și urmărim
      // noul ei indice; mutarea peste o înălțime existentă e refuzată)
      const pitchIdx = state.selectedPitchIndex
      if (pitchIdx === null) {
        return updateNote(state, state.selectedId, (n) =>
          n.type === "note" ? { ...n, pitches: n.pitches.map(move) } : n,
        )
      }
      let newIndex = pitchIdx
      const next = updateNote(state, state.selectedId, (n) => {
        if (n.type !== "note" || !n.pitches[pitchIdx]) return n
        const moved = move(n.pitches[pitchIdx])
        const others = n.pitches.filter((_, i) => i !== pitchIdx)
        if (others.some((p) => p.step === moved.step && p.octave === moved.octave)) return n
        const pitches = [...others, moved].sort((a, b) => pitchIndex(a) - pitchIndex(b))
        newIndex = pitches.indexOf(moved)
        return { ...n, pitches }
      })
      return { ...next, selectedPitchIndex: newIndex }
    }

    case "toggleAccidental": {
      if (!state.selectedId) return state
      const pitchIdx = state.selectedPitchIndex
      return updateNote(state, state.selectedId, (n) => {
        if (n.type !== "note") return n
        // cu o înălțime selectată, alterația se aplică doar ei; altfel întregii
        // intrări (comutator pe baza primei înălțimi)
        if (pitchIdx !== null) {
          const target = n.pitches[pitchIdx]
          if (!target) return n
          const next = target.accidental === action.accidental ? undefined : action.accidental
          return {
            ...n,
            pitches: n.pitches.map((p, i) => (i === pitchIdx ? { ...p, accidental: next } : p)),
          }
        }
        const next = n.pitches[0]?.accidental === action.accidental ? undefined : action.accidental
        return { ...n, pitches: n.pitches.map((p) => ({ ...p, accidental: next })) }
      })
    }

    case "toggleArticulation": {
      if (!state.selectedId) return state
      return updateNote(state, state.selectedId, (n) => {
        if (n.type !== "note") return n
        const current = n.articulations ?? []
        const next = current.includes(action.articulation)
          ? current.filter((a) => a !== action.articulation)
          : [...current, action.articulation]
        return { ...n, articulations: next.length > 0 ? next : undefined }
      })
    }

    case "toggleDot": {
      // punct de prelungire (durata +50%) — valabil și pentru pauze
      if (!state.selectedId) return state
      return updateNote(state, state.selectedId, (n) => ({ ...n, dotted: n.dotted ? undefined : true }))
    }

    case "toggleRest": {
      // comută intrarea selectată între notă și pauză, păstrând durata, punctul
      // și înălțimile stocate — P înapoi restaurează nota (inclusiv acordul)
      if (!state.selectedId) return state
      return updateNote(state, state.selectedId, (n) => ({
        ...n,
        type: n.type === "note" ? "rest" : "note",
      }))
    }

    case "toggleSlur": {
      const staff = staffOfNote(state, state.selectedId) ?? activeStaff(state)
      const index = staff.notes.findIndex((n) => n.id === state.selectedId)
      // legato leagă nota selectată de următoarea, în același portativ
      if (index < 0 || index >= staff.notes.length - 1) return state
      const fromId = staff.notes[index].id
      const toId = staff.notes[index + 1].id
      const exists = staff.slurs.some((s) => s.fromId === fromId)
      const slurs = exists
        ? staff.slurs.filter((s) => s.fromId !== fromId)
        : [...staff.slurs, { fromId, toId }]
      return updateStaff(state, staff.id, (s) => ({ ...s, slurs }))
    }

    case "setKeySignature":
      // armura e per portativ — schimbă doar portativul activ
      return updateStaff(state, state.activeStaffId, (s) => ({ ...s, keySignature: action.keySignature }))

    case "setClef":
      // cheia (clef) e per portativ — schimbă doar portativul activ
      return updateStaff(state, state.activeStaffId, (s) => ({ ...s, clef: action.clef }))

    case "setTimeSignature":
      return { ...state, timeSignature: action.timeSignature }

    case "addStaff": {
      // instrumentele cu portativ dublu (pian/orgă) adaugă două portative legate
      // printr-o acoladă (același `groupId`); restul, unul singur
      const clefs = clefsForInstrument(action.instrument)
      const groupId = clefs.length > 1 ? nextGroupId() : undefined
      const newStaves: Staff[] = clefs.map((clef) => ({
        id: nextStaffId(),
        instrument: action.instrument,
        clef,
        keySignature: "C",
        groupId,
        notes: [],
        slurs: [],
      }))
      return {
        ...state,
        staves: [...state.staves, ...newStaves],
        activeStaffId: newStaves[0].id,
        selectedStaffIds: [],
        selectedId: null, selectedPitchIndex: null,
      }
    }

    case "removeStaff": {
      // ștergem tot grupul (instrumentul) căruia îi aparține portativul vizat
      const target = state.staves.find((s) => s.id === action.staffId)
      if (!target) return state
      const removedIds = new Set(
        target.groupId
          ? state.staves.filter((s) => s.groupId === target.groupId).map((s) => s.id)
          : [target.id],
      )
      const staves = state.staves.filter((s) => !removedIds.has(s.id))
      // nu permitem ștergerea ultimului portativ rămas
      if (staves.length === 0) return state
      const removedSelected = removedIds.has(staffOfNote(state, state.selectedId)?.id ?? "")
      return {
        ...state,
        staves,
        activeStaffId: removedIds.has(state.activeStaffId) ? staves[0].id : state.activeStaffId,
        selectedStaffIds: state.selectedStaffIds.filter((id) => !removedIds.has(id)),
        selectedId: removedSelected ? null : state.selectedId, selectedPitchIndex: removedSelected ? null : state.selectedPitchIndex,
      }
    }

    case "setActiveStaff":
      // click simplu pe un chip: face portativul activ și golește selecția de redare
      return { ...state, activeStaffId: action.staffId, selectedStaffIds: [], selectedId: null, selectedPitchIndex: null }

    case "toggleStaffSelection": {
      // Ctrl+click: comută apartenența la selecția pentru redare parțială.
      // NU schimbă portativul activ — selecția de redare e independentă de cel
      // de input, ca să se distingă clar de un click simplu. Un instrument cu
      // portativ dublu (pian) se comută în întregime (ambele portative).
      const target = state.staves.find((s) => s.id === action.staffId)
      const groupIds = target?.groupId
        ? state.staves.filter((s) => s.groupId === target.groupId).map((s) => s.id)
        : [action.staffId]
      const exists = state.selectedStaffIds.includes(action.staffId)
      const selectedStaffIds = exists
        ? state.selectedStaffIds.filter((id) => !groupIds.includes(id))
        : [...state.selectedStaffIds.filter((id) => !groupIds.includes(id)), ...groupIds]
      return { ...state, selectedStaffIds }
    }

    case "deleteSelected": {
      const staff = staffOfNote(state, state.selectedId)
      if (!staff || !state.selectedId) return state

      // cu o înălțime selectată dintr-un acord (2+), ștergem doar acea înălțime
      const entry = staff.notes.find((n) => n.id === state.selectedId)
      if (
        state.selectedPitchIndex !== null &&
        entry?.type === "note" &&
        entry.pitches.length > 1
      ) {
        const pitchIdx = state.selectedPitchIndex
        return {
          ...updateNote(state, state.selectedId, (n) => ({
            ...n,
            pitches: n.pitches.filter((_, i) => i !== pitchIdx),
          })),
          selectedPitchIndex: null,
        }
      }
      // selecția "alunecă" pe elementul din stânga celui șters (ca în MuseScore)
      const index = staff.notes.findIndex((n) => n.id === state.selectedId)
      const remaining = staff.notes.filter((n) => n.id !== state.selectedId)
      const slurs = staff.slurs.filter(
        (s) => s.fromId !== state.selectedId && s.toId !== state.selectedId,
      )
      const selectedId = remaining.length > 0 ? remaining[Math.max(0, index - 1)].id : null
      return { ...updateStaff(state, staff.id, (s) => ({ ...s, notes: remaining, slurs })), selectedId }
    }

    case "loadScore": {
      // adusă din localStorage — aliniem contoarele de id-uri ca să nu generăm
      // duplicate (generatoarele sunt efectele secundare asumate ale modulului)
      syncIdCounters(action.staves)
      return {
        ...state,
        staves: action.staves,
        timeSignature: action.timeSignature,
        activeStaffId: action.staves[0].id,
        selectedStaffIds: [],
        selectedId: null, selectedPitchIndex: null,
      }
    }

    case "newScore": {
      const staff: Staff = {
        id: nextStaffId(),
        instrument: "Vioară",
        clef: "treble",
        keySignature: "C",
        notes: [],
        slurs: [],
      }
      return {
        ...state,
        staves: [staff],
        timeSignature: { numerator: 4, denominator: 4 },
        activeStaffId: staff.id,
        selectedStaffIds: [],
        selectedId: null, selectedPitchIndex: null,
      }
    }

    default:
      return state
  }
}

// --- Undo/Redo: un strat de istoric peste reducer ---

export interface HistoryState {
  past: ScoreState[]
  present: ScoreState
  future: ScoreState[]
}

export type HistoryAction = ScoreAction | { type: "undo" } | { type: "redo" }

const HISTORY_LIMIT = 50

export const initialHistoryState: HistoryState = {
  past: [],
  present: initialScoreState,
  future: [],
}

/**
 * Reducer cu istoric: snapshot-urile se fac DOAR când se schimbă conținutul
 * partiturii (detectat ieftin prin identitatea referințelor `staves` /
 * `timeSignature` — reducer-ul întoarce referințe noi numai la schimbări).
 * Selecțiile, navigarea și preferințele de input nu poluează istoricul, dar
 * sunt restaurate odată cu starea din care s-a făcut snapshot-ul.
 */
export function historyReducer(history: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "undo") {
    const previous = history.past[history.past.length - 1]
    if (!previous) return history
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
    }
  }

  if (action.type === "redo") {
    const [next, ...rest] = history.future
    if (!next) return history
    return {
      past: [...history.past, history.present],
      present: next,
      future: rest,
    }
  }

  const present = scoreReducer(history.present, action)
  if (present === history.present) return history

  const contentChanged =
    present.staves !== history.present.staves || present.timeSignature !== history.present.timeSignature
  if (!contentChanged) return { ...history, present }

  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
  }
}
