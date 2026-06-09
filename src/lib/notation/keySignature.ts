import type { Accidental, KeySignature, Step } from "@/types/score"

// ordinea în care apar alterațiile în armură (cvinte)
const SHARP_ORDER: Step[] = ["F", "C", "G", "D", "A", "E", "B"]
const FLAT_ORDER: Step[] = ["B", "E", "A", "D", "G", "C", "F"]

// câte diezi/bemoli are fiecare tonalitate majoră
const SHARP_KEYS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6 }
const FLAT_KEYS: Record<string, number> = { F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6 }

/** Tonalitățile oferite în selector, cu eticheta în română */
export const KEY_SIGNATURES: { spec: KeySignature; label: string }[] = [
  { spec: "C", label: "Do major — fără alterații" },
  { spec: "G", label: "Sol major — 1♯" },
  { spec: "D", label: "Re major — 2♯" },
  { spec: "A", label: "La major — 3♯" },
  { spec: "E", label: "Mi major — 4♯" },
  { spec: "B", label: "Si major — 5♯" },
  { spec: "F#", label: "Fa♯ major — 6♯" },
  { spec: "F", label: "Fa major — 1♭" },
  { spec: "Bb", label: "Si♭ major — 2♭" },
  { spec: "Eb", label: "Mi♭ major — 3♭" },
  { spec: "Ab", label: "La♭ major — 4♭" },
  { spec: "Db", label: "Re♭ major — 5♭" },
  { spec: "Gb", label: "Sol♭ major — 6♭" },
]

/**
 * Construiește, pentru o tonalitate, alterația implicită a fiecărei trepte.
 * Ex. în Sol major (`"G"`) treapta F devine diez. Folosit la redare: o notă
 * fără alterație explicită sună conform armurii.
 */
export function keyAccidentalMap(spec: KeySignature): Partial<Record<Step, Accidental>> {
  const map: Partial<Record<Step, Accidental>> = {}
  if (spec in SHARP_KEYS) {
    for (let i = 0; i < SHARP_KEYS[spec]; i++) map[SHARP_ORDER[i]] = "sharp"
  } else if (spec in FLAT_KEYS) {
    for (let i = 0; i < FLAT_KEYS[spec]; i++) map[FLAT_ORDER[i]] = "flat"
  }
  return map
}

/** Numărul de alterații din armură — folosit pentru a rezerva spațiu la desenare */
export function keyAccidentalCount(spec: KeySignature): number {
  if (spec in SHARP_KEYS) return SHARP_KEYS[spec]
  if (spec in FLAT_KEYS) return FLAT_KEYS[spec]
  return 0
}
