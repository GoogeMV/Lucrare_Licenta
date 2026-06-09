import type {
  Accidental,
  Articulation,
  Clef,
  Duration,
  KeySignature,
  NoteEntry,
  Pitch,
  Staff,
  TimeSignature,
} from "@/types/score"
import { stepDown, stepUp } from "@/lib/notation/pitch"
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

/** Înălțimea implicită: poziția pe linia de mijloc (b/4), folosită pentru pauze
 *  și ca punct de pornire când inserăm o notă fără un context anterior. */
export const DEFAULT_PITCH: Pitch = { step: "B", octave: 4 }

/** O melodie scurtă de pornire, ca pagina să nu fie goală la prima deschidere. */
const INITIAL_NOTES: NoteEntry[] = [
  { id: nextId(), type: "note", pitch: { step: "G", octave: 4 }, duration: "quarter" },
  { id: nextId(), type: "note", pitch: { step: "B", octave: 4 }, duration: "quarter" },
  { id: nextId(), type: "note", pitch: { step: "D", octave: 5 }, duration: "quarter" },
  { id: nextId(), type: "note", pitch: { step: "C", octave: 5 }, duration: "quarter" },
  { id: nextId(), type: "note", pitch: { step: "E", octave: 5 }, duration: "half" },
  { id: nextId(), type: "note", pitch: { step: "G", octave: 4 }, duration: "quarter" },
  { id: nextId(), type: "note", pitch: { step: "F", octave: 4 }, duration: "eighth" },
  { id: nextId(), type: "note", pitch: { step: "G", octave: 4 }, duration: "eighth" },
  { id: nextId(), type: "note", pitch: { step: "A", octave: 4 }, duration: "quarter" },
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
  /** Durata curentă de input — folosită la adăugarea/inserarea de note noi */
  selectedDuration: Duration
}

export type ScoreAction =
  | { type: "selectNote"; id: string | null }
  | { type: "moveSelection"; direction: "prev" | "next" }
  | { type: "addNoteAtPitch"; staffId: string; pitch: Pitch }
  | { type: "insertNote" }
  | { type: "insertRest"; duration: Duration }
  | { type: "setDuration"; duration: Duration }
  | { type: "transposeSelected"; direction: "up" | "down" }
  | { type: "toggleAccidental"; accidental: Accidental }
  | { type: "toggleArticulation"; articulation: Articulation }
  | { type: "toggleSlur" }
  | { type: "setKeySignature"; keySignature: KeySignature }
  | { type: "setClef"; clef: Clef }
  | { type: "setTimeSignature"; timeSignature: TimeSignature }
  | { type: "addStaff"; instrument: string }
  | { type: "removeStaff"; staffId: string }
  | { type: "setActiveStaff"; staffId: string }
  | { type: "toggleStaffSelection"; staffId: string }
  | { type: "deleteSelected" }

export const initialScoreState: ScoreState = {
  staves: [INITIAL_STAFF],
  activeStaffId: INITIAL_STAFF.id,
  selectedStaffIds: [],
  timeSignature: { numerator: 4, denominator: 4 },
  selectedId: null,
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
  return { ...updateStaff(state, staff.id, (s) => ({ ...s, notes })), selectedId: entry.id }
}

export function scoreReducer(state: ScoreState, action: ScoreAction): ScoreState {
  switch (action.type) {
    case "selectNote": {
      // selectarea unei note face activ portativul care o conține
      const staff = staffOfNote(state, action.id)
      return { ...state, selectedId: action.id, activeStaffId: staff?.id ?? state.activeStaffId }
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
      return { ...state, selectedId: staff.notes[next].id, activeStaffId: staff.id }
    }

    case "addNoteAtPitch": {
      const entry: NoteEntry = {
        id: nextId(),
        type: "note",
        pitch: action.pitch,
        duration: state.selectedDuration,
      }
      const next = updateStaff(state, action.staffId, (s) => ({ ...s, notes: [...s.notes, entry] }))
      return { ...next, activeStaffId: action.staffId, selectedId: entry.id }
    }

    case "insertNote": {
      const staff = activeStaff(state)
      const selIndex = staff.notes.findIndex((n) => n.id === state.selectedId)
      // păstrăm înălțimea notei selectate ca punct de pornire pentru cea nouă
      const basePitch = selIndex >= 0 ? staff.notes[selIndex].pitch : DEFAULT_PITCH
      const entry: NoteEntry = {
        id: nextId(),
        type: "note",
        pitch: basePitch,
        duration: state.selectedDuration,
      }
      return insertInActiveStaff(state, entry)
    }

    case "insertRest": {
      const entry: NoteEntry = {
        id: nextId(),
        type: "rest",
        pitch: DEFAULT_PITCH,
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
      return updateNote(state, state.selectedId, (n) =>
        n.type === "note"
          ? { ...n, pitch: action.direction === "up" ? stepUp(n.pitch) : stepDown(n.pitch) }
          : n,
      )
    }

    case "toggleAccidental": {
      if (!state.selectedId) return state
      return updateNote(state, state.selectedId, (n) => {
        if (n.type !== "note") return n
        // a doua apăsare a aceleiași alterații o elimină (comutator)
        const next = n.pitch.accidental === action.accidental ? undefined : action.accidental
        return { ...n, pitch: { ...n.pitch, accidental: next } }
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
        selectedId: null,
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
        selectedId: removedSelected ? null : state.selectedId,
      }
    }

    case "setActiveStaff":
      // click simplu pe un chip: face portativul activ și golește selecția de redare
      return { ...state, activeStaffId: action.staffId, selectedStaffIds: [], selectedId: null }

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
      // selecția "alunecă" pe elementul din stânga celui șters (ca în MuseScore)
      const index = staff.notes.findIndex((n) => n.id === state.selectedId)
      const remaining = staff.notes.filter((n) => n.id !== state.selectedId)
      const slurs = staff.slurs.filter(
        (s) => s.fromId !== state.selectedId && s.toId !== state.selectedId,
      )
      const selectedId = remaining.length > 0 ? remaining[Math.max(0, index - 1)].id : null
      return { ...updateStaff(state, staff.id, (s) => ({ ...s, notes: remaining, slurs })), selectedId }
    }

    default:
      return state
  }
}
