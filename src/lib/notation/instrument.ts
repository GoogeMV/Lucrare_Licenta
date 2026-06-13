import type { Clef } from "@/types/score"

/**
 * Cheia implicită a fiecărui instrument (corespunde celor din `InstrumentPalette`).
 * Pian/orgă folosesc în realitate un sistem de două portative (cheie sol + fa) —
 * aici le simplificăm la un singur portativ în cheia sol.
 */
export const INSTRUMENT_CLEFS: Record<string, Clef> = {
  Vioară: "treble",
  Violă: "alto",
  Violoncel: "bass",
  Contrabas: "bass",
  Flaut: "treble",
  Oboi: "treble",
  Clarinet: "treble",
  Fagot: "bass",
  Trompetă: "treble",
  Corn: "treble",
  Trombon: "bass",
  Tubă: "bass",
  Pian: "treble",
  "Pian electric": "treble",
  Orgă: "treble",
  Chitară: "treble",
  "Chitară electrică": "treble",
  "Chitară clasică": "treble",
  "Chitară bas": "bass",
}

export function clefForInstrument(instrument: string): Clef {
  return INSTRUMENT_CLEFS[instrument] ?? "treble"
}

/**
 * Instrumentele cu portativ dublu (sistem de pian): se notează pe două
 * portative — cheie sol (mâna dreaptă) + cheie fa (mâna stângă) — legate
 * printr-o acoladă.
 */
export const GRAND_STAFF_CLEFS: Clef[] = ["treble", "bass"]
const GRAND_STAFF_INSTRUMENTS = new Set(["Pian", "Pian electric", "Orgă"])

export function isGrandStaff(instrument: string): boolean {
  return GRAND_STAFF_INSTRUMENTS.has(instrument)
}

/** Cheile portativelor care compun un instrument (1 pentru majoritatea, 2 pentru pian/orgă) */
export function clefsForInstrument(instrument: string): Clef[] {
  return isGrandStaff(instrument) ? GRAND_STAFF_CLEFS : [clefForInstrument(instrument)]
}

/** Abrevieri pentru numele lungi, ca eticheta să nu intre peste portativ */
const INSTRUMENT_ABBREVIATIONS: Record<string, string> = {
  "Pian electric": "Pian el.",
  "Chitară electrică": "Chit. el.",
  "Chitară clasică": "Chit. cl.",
  "Chitară bas": "Chit. bas",
}

/** Numele scurt afișat ca etichetă în stânga portativului */
export function instrumentLabel(instrument: string): string {
  const abbreviation = INSTRUMENT_ABBREVIATIONS[instrument]
  if (abbreviation) return abbreviation
  return instrument.length > 9 ? `${instrument.slice(0, 8)}…` : instrument
}

/** Cheile (clef) oferite în selector, cu eticheta în română */
export const CLEF_OPTIONS: { clef: Clef; label: string }[] = [
  { clef: "treble", label: "Cheie sol" },
  { clef: "bass", label: "Cheie fa" },
  { clef: "alto", label: "Cheie do" },
]
