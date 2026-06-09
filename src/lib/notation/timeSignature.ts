import type { TimeSignature } from "@/types/score"

/** Indicațiile de măsură oferite în selector */
export const TIME_SIGNATURES: TimeSignature[] = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 2, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 3, denominator: 8 },
  { numerator: 2, denominator: 2 },
]

/** Eticheta text a unei măsuri, ex. "4/4" */
export function timeSignatureLabel(ts: TimeSignature): string {
  return `${ts.numerator}/${ts.denominator}`
}

/**
 * Durata unei măsuri exprimată în pătrimi (unitatea folosită de `DURATION_BEATS`).
 * Ex. 4/4 → 4, 3/4 → 3, 6/8 → 3, 2/2 → 4.
 */
export function measureQuarters(ts: TimeSignature): number {
  return (ts.numerator * 4) / ts.denominator
}

/** Subdiviziunea Tone.js corespunzătoare numitorului (ex. 8 → "8n") */
export function toneBeatSubdivision(ts: TimeSignature): string {
  return `${ts.denominator}n`
}

/** Durata unui timp (în secunde) la un tempo dat în pătrimi pe minut */
export function beatSeconds(ts: TimeSignature, bpm: number): number {
  const secondsPerQuarter = 60 / bpm
  return secondsPerQuarter * (4 / ts.denominator)
}
