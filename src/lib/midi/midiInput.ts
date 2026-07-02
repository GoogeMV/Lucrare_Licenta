/**
 * Intrare MIDI (Web MIDI API): note de la o claviatură/controller MIDI extern.
 * Manager singleton — butonul „MIDI" îl pornește/oprește, iar InteractiveStave se
 * abonează la note-on/note-off ca să introducă note în partitură.
 *
 * Convertirea număr MIDI → înălțime se face la consumator (`semitoneToPitch(n-12)`),
 * aici doar transmitem numărul brut. Web MIDI cere HTTPS (sau localhost) și permisiune.
 */

type NoteListener = (midiNote: number, velocity: number) => void
type StateListener = (deviceNames: string[]) => void

let access: MIDIAccess | null = null
let inputs: MIDIInput[] = []
let enabled = false
/** Modul de durată: false = durata aleasă din toolbar; true = durata din cât ții clapa */
let durationFromHold = false

const noteOnListeners = new Set<NoteListener>()
const noteOffListeners = new Set<NoteListener>()
const stateListeners = new Set<StateListener>()
const modeListeners = new Set<(fromHold: boolean) => void>()

/** Intrarea MIDI e pornită (din buton)? */
export function isMidiEnabled(): boolean {
  return enabled
}

/** Durata notelor MIDI vine din cât ții clapa apăsată (cuantizată la tempo)? */
export function isMidiDurationFromHold(): boolean {
  return durationFromHold
}

/** Comută modul de durată (manual ↔ din cât ții clapa) și anunță abonații. */
export function setMidiDurationFromHold(value: boolean) {
  durationFromHold = value
  modeListeners.forEach((fn) => fn(value))
}

/** Abonare la schimbarea modului de durată (pentru UI-ul butonului). */
export function onMidiModeChange(fn: (fromHold: boolean) => void): () => void {
  modeListeners.add(fn)
  return () => {
    modeListeners.delete(fn)
  }
}

/** Browserul suportă Web MIDI? (Chrome/Edge da; Firefox/Safari parțial sau deloc) */
export function isMidiSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function"
}

function handleMessage(event: MIDIMessageEvent) {
  const data = event.data
  if (!data || data.length < 3) return
  const command = data[0] & 0xf0
  const note = data[1]
  const velocity = data[2]
  if (command === 0x90 && velocity > 0) {
    noteOnListeners.forEach((fn) => fn(note, velocity))
  } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    // note-off = status 0x80 SAU note-on cu viteză 0 (convenția unor claviaturi)
    noteOffListeners.forEach((fn) => fn(note, velocity))
  }
}

/** (Re)atașează ascultătorul pe toate intrările curente (la enable / hot-plug). */
function wireInputs() {
  if (!access) return
  inputs = Array.from(access.inputs.values())
  inputs.forEach((input) => {
    input.onmidimessage = enabled ? handleMessage : null
  })
  const names = inputs.map((i) => i.name ?? "MIDI")
  stateListeners.forEach((fn) => fn(enabled ? names : []))
}

/** Cere acces MIDI (permisiune) și pornește ascultarea. Întoarce numele intrărilor. */
export async function enableMidi(): Promise<string[]> {
  if (!isMidiSupported()) throw new Error("Web MIDI nu e suportat de acest browser")
  if (!access) {
    access = await navigator.requestMIDIAccess()
    // dispozitive conectate/deconectate „la cald" → re-atașăm ascultătorul
    access.onstatechange = () => wireInputs()
  }
  enabled = true
  wireInputs()
  return inputs.map((i) => i.name ?? "MIDI")
}

/** Oprește ascultarea (păstrează accesul, ca repornirea să fie instant). */
export function disableMidi() {
  enabled = false
  inputs.forEach((input) => {
    input.onmidimessage = null
  })
  stateListeners.forEach((fn) => fn([]))
}

export function onMidiNoteOn(fn: NoteListener): () => void {
  noteOnListeners.add(fn)
  return () => {
    noteOnListeners.delete(fn)
  }
}

export function onMidiNoteOff(fn: NoteListener): () => void {
  noteOffListeners.add(fn)
  return () => {
    noteOffListeners.delete(fn)
  }
}

/** Abonare la lista de dispozitive (numele intrărilor; gol când e oprit). */
export function onMidiStateChange(fn: StateListener): () => void {
  stateListeners.add(fn)
  return () => {
    stateListeners.delete(fn)
  }
}
