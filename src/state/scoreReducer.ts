import type {
  Accidental,
  Articulation,
  BarType,
  Clef,
  Duration,
  Dynamic,
  KeySignature,
  NoteEntry,
  Pitch,
  Staff,
  StaffDisplay,
  Step,
  TimeSignature,
} from "@/types/score"
import { nearestPitchWithStep, pitchIndex, pitchSemitone, semitoneToPitch, stepDown, stepUp } from "@/lib/notation/pitch"
import { entryBeats, smallerDuration } from "@/lib/notation/duration"
import { clefsForInstrument } from "@/lib/notation/instrument"
import { decompose } from "@/lib/notation/measure"
import { measureQuarters } from "@/lib/notation/timeSignature"
import { tabPosition, tuningForInstrument } from "@/lib/notation/tab"

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
export function nextGroupId() {
  groupCounter += 1
  return `group-${groupCounter}`
}

let tupletCounter = 0
function nextTupletId() {
  tupletCounter += 1
  return `tuplet-${tupletCounter}`
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
      tupletCounter = bump(note.tupletId, "tuplet-", tupletCounter)
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
  /** Nota selectată curent (id global, în orice portativ) sau `null`.
   *  E "capul" selecției: ținta audiției și a operațiilor per-acord; ultima
   *  notă atinsă la extinderea unui interval. */
  selectedId: string | null
  /**
   * Toate notele din selecția curentă, în ordinea din portativ. Conține și
   * `selectedId`; pentru o selecție simplă are un singur element. O selecție
   * multiplă (interval) e mereu contiguă și în ACELAȘI portativ (Shift+click /
   * Shift+←→). Operațiile de editare (ștergere, transpunere, alterații…) se
   * aplică pe toate notele din această listă.
   */
  selectedIds: string[]
  /** Ancora intervalului (capătul fix la extinderea cu Shift) sau `null` */
  selectionAnchorId: string | null
  /**
   * Înălțimea selectată din acord (indice în `pitches`), sau `null` = toată
   * intrarea. Setată de click-ul pe un cap de notă; Delete/↑↓/alterațiile
   * acționează doar pe acea înălțime când e setată. Valabilă doar la o selecție
   * simplă (un interval ignoră înălțimea individuală).
   */
  selectedPitchIndex: number | null
  /** Durata curentă de input — folosită la adăugarea/inserarea de note noi */
  selectedDuration: Duration
  /** Bare speciale per index de măsură (repetiții, bară finală/dublă). Global,
   *  ca indicația de măsură. Lipsă/absent = bară simplă implicită. */
  barlines: Record<number, BarType>
  /** De câte ori se cântă secțiunea care se termină cu `repeat-end` pe acea măsură
   *  (implicit 2). Cheia = index de măsură (același ca al barei repeat-end). */
  repeatCounts: Record<number, number>
}

export type ScoreAction =
  | { type: "selectNote"; id: string | null; pitchIndex?: number }
  | { type: "extendSelectionTo"; id: string }
  | { type: "extendSelection"; direction: "prev" | "next" }
  | { type: "toggleNoteInSelection"; id: string }
  | { type: "setSelection"; ids: string[] }
  | { type: "pasteNotes"; entries: NoteEntry[] }
  | { type: "moveSelection"; direction: "prev" | "next" }
  | { type: "addNoteAtPitch"; staffId: string; pitch: Pitch; beforeId?: string }
  | { type: "addNoteAfterGap"; staffId: string; pitch: Pitch; gapBeats: number }
  | { type: "addPitchToNote"; noteId: string; pitch: Pitch }
  | { type: "insertNote" }
  | { type: "insertNoteWithStep"; step: Step }
  | { type: "insertNoteWithPitch"; pitch: Pitch }
  | { type: "addPitchToSelectedNote"; pitch: Pitch }
  | { type: "insertRest"; duration: Duration }
  | { type: "setDuration"; duration: Duration }
  | { type: "transposeSelected"; direction: "up" | "down" }
  | { type: "toggleAccidental"; accidental: Accidental }
  | { type: "toggleArticulation"; articulation: Articulation }
  | { type: "setDynamic"; dynamic: Dynamic }
  | { type: "setLyric"; id: string; text: string }
  | { type: "toggleDot" }
  | { type: "makeTriplet" }
  | { type: "toggleRest" }
  | { type: "toggleSlur" }
  | { type: "setKeySignature"; keySignature: KeySignature }
  | { type: "setClef"; clef: Clef }
  | { type: "setStaffDisplay"; staffId: string; display: StaffDisplay }
  | { type: "setFret"; fret: number }
  | { type: "setTimeSignature"; timeSignature: TimeSignature }
  | { type: "setBarline"; barType: BarType }
  | { type: "setRepeatCount"; times: number }
  | { type: "addStaff"; instrument: string }
  | { type: "removeStaff"; staffId: string }
  | { type: "setActiveStaff"; staffId: string }
  | { type: "toggleStaffSelection"; staffId: string }
  | { type: "clearStaffSelection" }
  | { type: "deleteSelected" }
  | {
      type: "loadScore"
      staves: Staff[]
      timeSignature: TimeSignature
      barlines?: Record<number, BarType>
      repeatCounts?: Record<number, number>
    }
  | { type: "newScore" }

export const initialScoreState: ScoreState = {
  staves: [INITIAL_STAFF],
  activeStaffId: INITIAL_STAFF.id,
  selectedStaffIds: [],
  timeSignature: { numerator: 4, denominator: 4 },
  selectedId: null,
  selectedIds: [],
  selectionAnchorId: null,
  selectedPitchIndex: null,
  selectedDuration: "quarter",
  barlines: {},
  repeatCounts: {},
}

/**
 * Câmpurile de selecție pentru o selecție SIMPLĂ (o singură notă sau nimic):
 * capul, intervalul de un element și ancora coincid. Centralizat ca toate
 * operațiile care "colapsează" selecția (click, navigare, inserare) să rămână
 * consistente — `selectedIds` conține mereu și `selectedId`.
 */
function selectSingle(id: string | null, pitchIndex: number | null = null) {
  return {
    selectedId: id,
    selectedIds: id ? [id] : [],
    selectionAnchorId: id,
    selectedPitchIndex: pitchIndex,
  }
}

/** Copie adâncă a unei intrări, fără id (paste-ul generează id-uri noi) */
function cloneEntry(entry: NoteEntry): Omit<NoteEntry, "id"> {
  return {
    type: entry.type,
    pitches: entry.pitches.map((p) => ({ ...p })),
    duration: entry.duration,
    dotted: entry.dotted,
    articulations: entry.articulations ? [...entry.articulations] : undefined,
    dynamic: entry.dynamic,
    lyric: entry.lyric,
    tuplet: entry.tuplet,
    tupletId: entry.tupletId,
  }
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

/** Indexul măsurii în care se află nota selectată (sau `null`) — pentru barele
 *  și repetițiile atașate „măsurii notei selectate". */
function selectedMeasureIndex(state: ScoreState): number | null {
  if (!state.selectedId) return null
  const staff = staffOfNote(state, state.selectedId)
  if (!staff) return null
  const beatsPerMeasure = measureQuarters(state.timeSignature)
  let beat = 0
  for (const n of staff.notes) {
    if (n.id === state.selectedId) return Math.floor(beat / beatsPerMeasure + 1e-9)
    beat += entryBeats(n)
  }
  return null
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

/** Transformă, în TOATE portativele, notele al căror id e în `ids` — pentru
 *  operații pe o selecție care poate cuprinde mai multe portative (Alt+click). */
function updateNotesInIds(state: ScoreState, ids: Set<string>, fn: (n: NoteEntry) => NoteEntry): ScoreState {
  return {
    ...state,
    staves: state.staves.map((s) =>
      s.notes.some((n) => ids.has(n.id))
        ? { ...s, notes: s.notes.map((n) => (ids.has(n.id) ? fn(n) : n)) }
        : s,
    ),
  }
}

/** Toate notele selectate, din toate portativele, în ordine */
function selectedEntries(state: ScoreState): NoteEntry[] {
  const ids = new Set(state.selectedIds)
  const out: NoteEntry[] = []
  for (const s of state.staves) for (const n of s.notes) if (ids.has(n.id)) out.push(n)
  return out
}

/** Inserează o intrare în portativul activ, după nota selectată (sau la final) */
function insertInActiveStaff(state: ScoreState, entry: NoteEntry): ScoreState {
  const staff = activeStaff(state)
  const selIndex = staff.notes.findIndex((n) => n.id === state.selectedId)
  const insertAt = selIndex >= 0 ? selIndex + 1 : staff.notes.length
  const notes = [...staff.notes]
  notes.splice(insertAt, 0, entry)
  return { ...updateStaff(state, staff.id, (s) => ({ ...s, notes })), ...selectSingle(entry.id) }
}

export function scoreReducer(state: ScoreState, action: ScoreAction): ScoreState {
  switch (action.type) {
    case "selectNote": {
      // selectarea unei note face activ portativul care o conține
      const staff = staffOfNote(state, action.id)
      return { ...state, ...selectSingle(action.id, action.pitchIndex ?? null), activeStaffId: staff?.id ?? state.activeStaffId }
    }

    case "extendSelectionTo": {
      // Shift+click: extinde selecția de la ancoră până la nota țintă, contiguu.
      // Dacă ținta e în alt portativ decât ancora (sau nu există ancoră), pornim
      // o selecție simplă nouă cu ancora în țintă.
      const targetStaff = staffOfNote(state, action.id)
      if (!targetStaff) return state
      const anchorId = state.selectionAnchorId ?? state.selectedId
      const anchorStaff = staffOfNote(state, anchorId)
      if (!anchorId || anchorStaff?.id !== targetStaff.id) {
        return { ...state, ...selectSingle(action.id), activeStaffId: targetStaff.id }
      }
      const aIdx = targetStaff.notes.findIndex((n) => n.id === anchorId)
      const tIdx = targetStaff.notes.findIndex((n) => n.id === action.id)
      if (aIdx < 0 || tIdx < 0) return state
      const [lo, hi] = aIdx <= tIdx ? [aIdx, tIdx] : [tIdx, aIdx]
      const selectedIds = targetStaff.notes.slice(lo, hi + 1).map((n) => n.id)
      return {
        ...state,
        selectedId: action.id,
        selectedIds,
        selectionAnchorId: anchorId,
        selectedPitchIndex: null,
        activeStaffId: targetStaff.id,
      }
    }

    case "toggleNoteInSelection": {
      // Alt+click (ca Ctrl pe Windows): adaugă/scoate o notă individuală din
      // selecție (ne-contiguu). Poate cuprinde MAI MULTE portative — ca să poți
      // reda segmente de pe instrumente diferite (Space le redă grupate pe portativ).
      const targetStaff = staffOfNote(state, action.id)
      if (!targetStaff) return state
      const set = new Set(state.selectedIds)
      const removing = set.has(action.id)
      if (removing) set.delete(action.id)
      else set.add(action.id)
      // ordonăm după portativ, apoi după poziția în portativ (ordine stabilă)
      const nextIds: string[] = []
      for (const s of state.staves) for (const n of s.notes) if (set.has(n.id)) nextIds.push(n.id)
      if (nextIds.length === 0) return { ...state, ...selectSingle(null) }
      // capul = nota apăsată dacă a rămas selectată, altfel ultima rămasă
      const head = set.has(action.id) ? action.id : nextIds[nextIds.length - 1]
      return {
        ...state,
        selectedId: head,
        selectedIds: nextIds,
        selectionAnchorId: head,
        selectedPitchIndex: null,
        activeStaffId: targetStaff.id,
      }
    }

    case "setSelection": {
      // selecție directă a unui set de note (marquee/dreptunghi): le restrângem
      // la portativul primei note și le ordonăm după poziția din portativ
      if (action.ids.length === 0) return { ...state, ...selectSingle(null) }
      const staff = staffOfNote(state, action.ids[0])
      if (!staff) return state
      const idSet = new Set(action.ids)
      const ordered = staff.notes.filter((n) => idSet.has(n.id)).map((n) => n.id)
      if (ordered.length === 0) return state
      return {
        ...state,
        selectedId: ordered[ordered.length - 1],
        selectedIds: ordered,
        selectionAnchorId: ordered[0],
        selectedPitchIndex: null,
        activeStaffId: staff.id,
      }
    }

    case "extendSelection": {
      // Shift+←/→: mută capul cu o notă și extinde/restrânge intervalul față de ancoră
      const staff = staffOfNote(state, state.selectedId) ?? activeStaff(state)
      if (staff.notes.length === 0) return state
      const headIdx = staff.notes.findIndex((n) => n.id === state.selectedId)
      if (headIdx < 0) return { ...state, ...selectSingle(staff.notes[0].id), activeStaffId: staff.id }
      const newHead =
        action.direction === "next"
          ? Math.min(headIdx + 1, staff.notes.length - 1)
          : Math.max(headIdx - 1, 0)
      const anchorId = state.selectionAnchorId ?? state.selectedId
      let aIdx = staff.notes.findIndex((n) => n.id === anchorId)
      if (aIdx < 0) aIdx = headIdx
      const [lo, hi] = aIdx <= newHead ? [aIdx, newHead] : [newHead, aIdx]
      const selectedIds = staff.notes.slice(lo, hi + 1).map((n) => n.id)
      return {
        ...state,
        selectedId: staff.notes[newHead].id,
        selectedIds,
        selectionAnchorId: staff.notes[aIdx].id,
        selectedPitchIndex: null,
        activeStaffId: staff.id,
      }
    }

    case "pasteNotes": {
      // lipește intrările din clipboard în portativul activ, după selecție (sau
      // la final), cu id-uri noi; selecția devine intervalul lipit
      if (action.entries.length === 0) return state
      const staff = activeStaff(state)
      const fresh: NoteEntry[] = action.entries.map((e) => ({ id: nextId(), ...cloneEntry(e) }))
      const selIndex = staff.notes.findIndex((n) => n.id === state.selectedId)
      const insertAt = selIndex >= 0 ? selIndex + 1 : staff.notes.length
      const notes = [...staff.notes]
      notes.splice(insertAt, 0, ...fresh)
      const ids = fresh.map((f) => f.id)
      return {
        ...updateStaff(state, staff.id, (s) => ({ ...s, notes })),
        selectedId: ids[ids.length - 1],
        selectedIds: ids,
        selectionAnchorId: ids[0],
        selectedPitchIndex: null,
      }
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
      return { ...state, ...selectSingle(staff.notes[next].id), activeStaffId: staff.id }
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
      return { ...next, activeStaffId: action.staffId, ...selectSingle(entry.id) }
    }

    case "addNoteAfterGap": {
      // click pe un portativ dincolo de notele lui existente: umplem golul cu
      // pauze (până la măsura în care s-a dat click), apoi adăugăm nota. Așa
      // nota apare unde s-a dat click, nu lipită de ultima notă existentă.
      const rests: NoteEntry[] = decompose(action.gapBeats).map((piece) => ({
        id: nextId(),
        type: "rest",
        pitches: [DEFAULT_PITCH],
        duration: piece.duration,
        dotted: piece.dotted,
      }))
      const note: NoteEntry = {
        id: nextId(),
        type: "note",
        pitches: [action.pitch],
        duration: state.selectedDuration,
      }
      const next = updateStaff(state, action.staffId, (s) => ({
        ...s,
        notes: [...s.notes, ...rests, note],
      }))
      return { ...next, activeStaffId: action.staffId, ...selectSingle(note.id) }
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
      return { ...next, activeStaffId: staff.id, ...selectSingle(action.noteId) }
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

    case "insertNoteWithPitch": {
      // introducere MIDI: o notă nouă la înălțimea EXACTĂ primită (octava dată),
      // inserată după nota selectată (ca litera C–B, dar fără calcul de octavă)
      const entry: NoteEntry = {
        id: nextId(),
        type: "note",
        pitches: [action.pitch],
        duration: state.selectedDuration,
      }
      return insertInActiveStaff(state, entry)
    }

    case "addPitchToSelectedNote": {
      // a doua (a treia…) tastă MIDI ținută simultan → acord pe nota tocmai
      // inserată (cea selectată). Reducer-ul procesează secvențial, deci selectedId
      // e deja nota nouă; refolosim logica de la addPitchToNote.
      if (!state.selectedId) return state
      return scoreReducer(state, { type: "addPitchToNote", noteId: state.selectedId, pitch: action.pitch })
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
      const ids = new Set(state.selectedIds)
      return {
        ...updateNotesInIds(state, ids, (n) => ({ ...n, duration: action.duration })),
        selectedDuration: action.duration,
      }
    }

    case "transposeSelected": {
      if (!state.selectedId) return state
      const move = action.direction === "up" ? stepUp : stepDown
      // selecție multiplă (interval, eventual pe mai multe portative): mutăm toate
      if (state.selectedIds.length > 1) {
        const ids = new Set(state.selectedIds)
        return updateNotesInIds(state, ids, (n) =>
          n.type === "note" ? { ...n, pitches: n.pitches.map(move) } : n,
        )
      }
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
      // interval (eventual pe mai multe portative): aplicăm aceeași alterație
      // tuturor înălțimilor ("toate au -> scoatem; altfel -> punem peste tot")
      if (state.selectedIds.length > 1) {
        const ids = new Set(state.selectedIds)
        const sel = selectedEntries(state).filter((n) => n.type === "note")
        const allHave =
          sel.length > 0 && sel.every((n) => n.pitches.every((p) => p.accidental === action.accidental))
        const nextAcc = allHave ? undefined : action.accidental
        return updateNotesInIds(state, ids, (n) =>
          n.type === "note" ? { ...n, pitches: n.pitches.map((p) => ({ ...p, accidental: nextAcc })) } : n,
        )
      }
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
      const ids = new Set(state.selectedIds)
      // regula "toate o au -> scoatem; altfel -> adăugăm unde lipsește"
      const sel = selectedEntries(state).filter((n) => n.type === "note")
      const allHave =
        sel.length > 0 && sel.every((n) => (n.articulations ?? []).includes(action.articulation))
      return updateNotesInIds(state, ids, (n) => {
        if (n.type !== "note") return n
        const current = n.articulations ?? []
        const next = allHave
          ? current.filter((a) => a !== action.articulation)
          : current.includes(action.articulation)
            ? current
            : [...current, action.articulation]
        return { ...n, articulations: next.length > 0 ? next : undefined }
      })
    }

    case "setDynamic": {
      // nuanță (dinamică) pe notele selectate — regula "toate o au -> scoatem;
      // altfel -> punem peste tot" (la o selecție simplă = comutator obișnuit)
      if (!state.selectedId) return state
      const ids = new Set(state.selectedIds)
      const sel = selectedEntries(state)
      const allHave = sel.length > 0 && sel.every((n) => n.dynamic === action.dynamic)
      const next = allHave ? undefined : action.dynamic
      return updateNotesInIds(state, ids, (n) => ({ ...n, dynamic: next }))
    }

    case "setLyric": {
      // silaba de versuri sub o notă (pauzele nu poartă versuri). Golirea o
      // șterge. Sărim peste no-op-uri ca să nu aglomerăm istoricul de undo.
      const text = action.text.trim() || undefined
      const staff = staffOfNote(state, action.id)
      const entry = staff?.notes.find((n) => n.id === action.id)
      if (!staff || !entry || entry.type !== "note" || entry.lyric === text) return state
      return updateNote(state, action.id, (n) => ({ ...n, lyric: text }))
    }

    case "toggleDot": {
      // punct de prelungire (durata +50%) — valabil și pentru pauze
      if (!state.selectedId) return state
      const ids = new Set(state.selectedIds)
      const sel = selectedEntries(state)
      const allDotted = sel.length > 0 && sel.every((n) => n.dotted)
      return updateNotesInIds(state, ids, (n) => ({ ...n, dotted: allDotted ? undefined : true }))
    }

    case "makeTriplet": {
      // transformă intrarea selectată într-un triolet: o înlocuiește cu 3 intrări
      // egale (aceeași înălțime/tip) de durata imediat mai mică (ex. pătrime → 3
      // optimi de triolet), care ocupă același timp — deci se aude ca un triolet
      // din prima. Doar prima păstrează articulațiile/nuanța/versul. Refuzat dacă
      // e deja triolet sau prea mic (șaisprezecime).
      if (!state.selectedId) return state
      const staff = staffOfNote(state, state.selectedId)
      if (!staff) return state
      const idx = staff.notes.findIndex((n) => n.id === state.selectedId)
      const entry = staff.notes[idx]
      if (!entry || entry.tuplet) return state
      const sub = smallerDuration(entry.duration)
      if (!sub) return state
      const tupletId = nextTupletId()
      const member = (withExtras: boolean): NoteEntry => ({
        id: nextId(),
        type: entry.type,
        pitches: entry.pitches.map((p) => ({ ...p })),
        duration: sub,
        tuplet: 3,
        tupletId,
        articulations: withExtras ? entry.articulations : undefined,
        dynamic: withExtras ? entry.dynamic : undefined,
        lyric: withExtras ? entry.lyric : undefined,
      })
      const triplet = [member(true), member(false), member(false)]
      const notes = [...staff.notes]
      notes.splice(idx, 1, ...triplet)
      return { ...updateStaff(state, staff.id, (s) => ({ ...s, notes })), ...selectSingle(triplet[0].id) }
    }

    case "toggleRest": {
      // comută intrarea selectată între notă și pauză, păstrând durata, punctul
      // și înălțimile stocate — P înapoi restaurează nota (inclusiv acordul).
      // Pe un interval: dacă toate sunt pauze -> note; altfel -> pauze.
      if (!state.selectedId) return state
      const ids = new Set(state.selectedIds)
      const sel = selectedEntries(state)
      const allRest = sel.length > 0 && sel.every((n) => n.type === "rest")
      const nextType: NoteEntry["type"] = allRest ? "note" : "rest"
      return updateNotesInIds(state, ids, (n) => ({ ...n, type: nextType }))
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

    case "setStaffDisplay":
      // modul de afișare (notație / TAB / ambele) — doar pentru chitare
      return updateStaff(state, action.staffId, (s) => ({ ...s, display: action.display }))

    case "setFret": {
      // setează fret-ul notei selectate pe coarda ei (sau cea auto), schimbând
      // înălțimea; coarda aleasă se reține ca TAB-ul să rămână pe ea
      if (!state.selectedId) return state
      const staff = staffOfNote(state, state.selectedId)
      if (!staff) return state
      const pIdx = state.selectedPitchIndex ?? 0
      const fret = Math.max(0, Math.min(24, action.fret))
      const tuning = tuningForInstrument(staff.instrument).map(pitchSemitone)
      return updateNote(state, state.selectedId, (n) => {
        if (n.type !== "note" || !n.pitches[pIdx]) return n
        const cur = n.pitches[pIdx]
        const str = cur.string ?? tabPosition(cur, staff.instrument).str
        const semitone = tuning[str - 1] + fret
        const next: Pitch = { ...semitoneToPitch(semitone), string: str }
        return { ...n, pitches: n.pitches.map((p, i) => (i === pIdx ? next : p)) }
      })
    }

    case "setTimeSignature":
      return { ...state, timeSignature: action.timeSignature }

    case "setBarline": {
      // bara se atașează măsurii notei selectate; re-aplicarea aceluiași tip o scoate
      const measureIndex = selectedMeasureIndex(state)
      if (measureIndex === null) return state
      const barlines = { ...state.barlines }
      if (barlines[measureIndex] === action.barType) delete barlines[measureIndex]
      else barlines[measureIndex] = action.barType
      // numărul de repetări are sens doar pentru repeat-end; altfel îl curățăm
      const repeatCounts = { ...state.repeatCounts }
      if (barlines[measureIndex] !== "repeat-end") delete repeatCounts[measureIndex]
      return { ...state, barlines, repeatCounts }
    }

    case "setRepeatCount": {
      // de câte ori se cântă secțiunea (2..8), pe măsura cu repeat-end a notei selectate
      const measureIndex = selectedMeasureIndex(state)
      if (measureIndex === null || state.barlines[measureIndex] !== "repeat-end") return state
      const times = Math.max(2, Math.min(8, Math.round(action.times)))
      return { ...state, repeatCounts: { ...state.repeatCounts, [measureIndex]: times } }
    }

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
        ...selectSingle(null),
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
        selectedPitchIndex: removedSelected ? null : state.selectedPitchIndex,
        selectedIds: removedSelected ? [] : state.selectedIds,
        selectionAnchorId: removedSelected ? null : state.selectionAnchorId,
      }
    }

    case "setActiveStaff":
      // click simplu pe un chip: face portativul activ și golește selecția de redare
      return { ...state, activeStaffId: action.staffId, selectedStaffIds: [], ...selectSingle(null) }

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

    case "clearStaffSelection":
      // golește bifarea portativelor pentru redare parțială (ex. la Esc)
      return state.selectedStaffIds.length === 0 ? state : { ...state, selectedStaffIds: [] }

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
      // ștergem selecția din TOATE portativele (poate cuprinde mai multe);
      // selecția "alunecă" pe elementul din stânga primei note șterse din
      // portativul capului (ca în MuseScore)
      const ids = new Set(state.selectedIds)
      const firstIndex = staff.notes.findIndex((n) => ids.has(n.id))
      const staves = state.staves.map((s) => ({
        ...s,
        notes: s.notes.filter((n) => !ids.has(n.id)),
        slurs: s.slurs.filter((sl) => !ids.has(sl.fromId) && !ids.has(sl.toId)),
      }))
      const remainingHead = staves.find((s) => s.id === staff.id)?.notes ?? []
      const selectedId = remainingHead.length > 0 ? remainingHead[Math.max(0, firstIndex - 1)].id : null
      return { ...state, staves, ...selectSingle(selectedId) }
    }

    case "loadScore": {
      // adusă din localStorage — aliniem contoarele de id-uri ca să nu generăm
      // duplicate (generatoarele sunt efectele secundare asumate ale modulului)
      syncIdCounters(action.staves)
      return {
        ...state,
        staves: action.staves,
        timeSignature: action.timeSignature,
        barlines: action.barlines ?? {},
        repeatCounts: action.repeatCounts ?? {},
        activeStaffId: action.staves[0].id,
        selectedStaffIds: [],
        ...selectSingle(null),
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
        barlines: {},
        repeatCounts: {},
        activeStaffId: staff.id,
        selectedStaffIds: [],
        ...selectSingle(null),
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
    present.staves !== history.present.staves ||
    present.timeSignature !== history.present.timeSignature ||
    present.barlines !== history.present.barlines ||
    present.repeatCounts !== history.present.repeatCounts
  if (!contentChanged) return { ...history, present }

  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
  }
}
