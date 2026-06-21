import type { Accidental, Clef, Pitch, Step } from "@/types/score"

const STEP_ORDER: Step[] = ["C", "D", "E", "F", "G", "A", "B"]

/** Sufixul de alterație în notația folosită de Tone.js (ex. "C#4", "Bb3") */
const ACCIDENTAL_TO_TONE: Record<Accidental, string> = {
  sharp: "#",
  flat: "b",
  natural: "", // fără armură, becarul nu schimbă înălțimea redată
}

/** Convertește o înălțime în numele de notă cerut de Tone.js, ex. "C#4" */
export function pitchToToneNote(pitch: Pitch): string {
  const accidental = pitch.accidental ? ACCIDENTAL_TO_TONE[pitch.accidental] : ""
  return `${pitch.step}${accidental}${pitch.octave}`
}

/** Coboară o înălțime cu un pas diatonic (treaptă muzicală) */
export function stepDown(pitch: Pitch): Pitch {
  const idx = STEP_ORDER.indexOf(pitch.step)
  if (idx === 0) return { step: "B", octave: pitch.octave - 1 }
  return { step: STEP_ORDER[idx - 1], octave: pitch.octave }
}

/** Urcă o înălțime cu un pas diatonic (treaptă muzicală) */
export function stepUp(pitch: Pitch): Pitch {
  const idx = STEP_ORDER.indexOf(pitch.step)
  if (idx === STEP_ORDER.length - 1) return { step: "C", octave: pitch.octave + 1 }
  return { step: STEP_ORDER[idx + 1], octave: pitch.octave }
}

/** Convertește o înălțime în formatul de cheie folosit de VexFlow, ex. "c/4" */
export function pitchToVexflowKey(pitch: Pitch): string {
  return `${pitch.step.toLowerCase()}/${pitch.octave}`
}

/** Indicele diatonic absolut al unei înălțimi (pentru comparat/sortat) */
export function pitchIndex(pitch: Pitch): number {
  return pitch.octave * 7 + STEP_ORDER.indexOf(pitch.step)
}

/** Semitonul cromatic al unei trepte în interiorul octavei (C=0 … B=11) */
const STEP_SEMITONE: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Înălțimea în semitonuri cromatice (relativ, ca MIDI fără offset) — pentru
 *  calculul fret-urilor în TAB (diferență de semitonuri = diferență de fret). */
export function pitchSemitone(pitch: Pitch): number {
  const acc = pitch.accidental === "sharp" ? 1 : pitch.accidental === "flat" ? -1 : 0
  return pitch.octave * 12 + STEP_SEMITONE[pitch.step] + acc
}

/** Tabel semiton-în-octavă → (treaptă, alterație) — folosim diezi (convenția chitarei) */
const SEMITONE_TO_STEP: [Step, Accidental?][] = [
  ["C"], ["C", "sharp"], ["D"], ["D", "sharp"], ["E"], ["F"],
  ["F", "sharp"], ["G"], ["G", "sharp"], ["A"], ["A", "sharp"], ["B"],
]

/** Inversul lui `pitchSemitone`: construiește o înălțime dintr-un semiton cromatic */
export function semitoneToPitch(semitone: number): Pitch {
  const octave = Math.floor(semitone / 12)
  const within = ((semitone % 12) + 12) % 12
  const [step, accidental] = SEMITONE_TO_STEP[within]
  return accidental ? { step, octave, accidental } : { step, octave }
}

/**
 * Înălțimea cu treapta dată, la octava cea mai apropiată de nota de referință
 * (ca la introducerea notelor din tastatură în MuseScore: după Sol4, tasta C
 * dă Do5 — cvartă ascendentă — nu Do4, care ar fi cvintă descendentă).
 */
export function nearestPitchWithStep(reference: Pitch, step: Step): Pitch {
  const referenceIndex = reference.octave * 7 + STEP_ORDER.indexOf(reference.step)
  let best: Pitch = { step, octave: reference.octave }
  let bestDistance = Infinity
  for (const octave of [reference.octave - 1, reference.octave, reference.octave + 1]) {
    const distance = Math.abs(octave * 7 + STEP_ORDER.indexOf(step) - referenceIndex)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { step, octave }
    }
  }
  return best
}

/**
 * Înălțimea liniei de sus a portativului, pentru fiecare cheie. Pornind de
 * acolo în jos, fiecare linie/spațiu e cu o treaptă diatonică mai jos —
 * construim o listă de "poziții" indexabilă direct după coordonata Y a unui click.
 *  - cheie sol (treble): linia de sus = F5
 *  - cheie fa (bass):    linia de sus = A3
 *  - cheie do (alto):    linia de sus = G4
 */
export const TOP_LINE_PITCH: Record<Clef, Pitch> = {
  treble: { step: "F", octave: 5 },
  bass: { step: "A", octave: 3 },
  alto: { step: "G", octave: 4 },
}

export function buildStaffPositions(count: number, top: Pitch): Pitch[] {
  const positions: Pitch[] = [top]
  for (let i = 1; i < count; i++) {
    positions.push(stepDown(positions[i - 1]))
  }
  return positions
}
