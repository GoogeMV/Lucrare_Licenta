import type { Duration, EntryType } from "@/types/score"
import { entryBeats } from "@/lib/notation/duration"

/**
 * Un fragment de notă într-o măsură: o porțiune dintr-o intrare (`noteIndex` =
 * indicele în lista originală de note), cu propria valoare de durată. O notă
 * care depășește bara de măsură e spartă în mai multe fragmente legate cu
 * ligatură (`tieStart`/`tieStop`), ca fiecare măsură să aibă exact câți timpi
 * trebuie. O notă care încape întreagă rămâne un singur fragment, cu durata ei.
 */
export interface MeasureFragment {
  /** Indicele intrării originale în `notes` */
  noteIndex: number
  duration: Duration
  dotted?: boolean
  /** Legată (tie) de fragmentul următor al ACELEIAȘI note */
  tieStart?: boolean
  /** Legată (tie) de fragmentul anterior al aceleiași note */
  tieStop?: boolean
}

/**
 * Paleta de valori de notă (în pătrimi), descrescător — folosită pentru a
 * descompune o durată oarecare (multiplu de 0.25) în valori notabile.
 */
const NOTE_VALUE_PALETTE: { beats: number; duration: Duration; dotted?: boolean }[] = [
  { beats: 4, duration: "whole" },
  { beats: 3, duration: "half", dotted: true },
  { beats: 2, duration: "half" },
  { beats: 1.5, duration: "quarter", dotted: true },
  { beats: 1, duration: "quarter" },
  { beats: 0.75, duration: "eighth", dotted: true },
  { beats: 0.5, duration: "eighth" },
  { beats: 0.25, duration: "sixteenth" },
]

const EPS = 1e-6

/** Descompune un număr de pătrimi în valori de notă notabile (greedy, cea mai
 *  mare valoare ≤ rest). Toate duratele/punctele noastre sunt multipli de 0.25,
 *  deci se termină mereu. Folosit și pentru a umple cu pauze golul dintre
 *  conținutul unui portativ și o măsură în care se dă click mai departe. */
export function decompose(beats: number): { duration: Duration; dotted?: boolean }[] {
  const out: { duration: Duration; dotted?: boolean }[] = []
  let remaining = beats
  while (remaining > EPS) {
    const piece = NOTE_VALUE_PALETTE.find((v) => v.beats <= remaining + EPS)
    if (!piece) break
    out.push({ duration: piece.duration, dotted: piece.dotted })
    remaining -= piece.beats
  }
  return out
}

/**
 * Împarte o listă de note în măsuri de fragmente. O notă care depășește spațiul
 * rămas e spartă: porțiunea care încape umple măsura curentă, restul continuă
 * în următoarea (legate cu ligatură). Folosită identic la randare
 * (InteractiveStave) și la export (MusicXML), ca ambele să vadă aceeași
 * împărțire. Pauzele se sparg la fel, dar fără ligatură.
 */
export function splitIntoMeasures(
  notes: { type?: EntryType; duration: Duration; dotted?: boolean }[],
  beatsPerMeasure: number,
): MeasureFragment[][] {
  const measures: MeasureFragment[][] = []
  let current: MeasureFragment[] = []
  let beatsInMeasure = 0

  const flush = () => {
    measures.push(current)
    current = []
    beatsInMeasure = 0
  }

  notes.forEach((entry, i) => {
    let remaining = entryBeats(entry)
    // fragmentele acestei note (ca să marcăm ligaturile între ele la final)
    const entryFrags: MeasureFragment[] = []

    while (remaining > EPS) {
      const space = beatsPerMeasure - beatsInMeasure
      if (space <= EPS) {
        flush()
        continue
      }
      const take = Math.min(space, remaining)
      for (const piece of decompose(take)) {
        const frag: MeasureFragment = { noteIndex: i, duration: piece.duration, dotted: piece.dotted }
        current.push(frag)
        entryFrags.push(frag)
      }
      beatsInMeasure += take
      remaining -= take
      if (beatsInMeasure >= beatsPerMeasure - EPS) flush()
    }

    // ligaturile leagă fragmentele consecutive ale aceleiași NOTE (nu pauze)
    if (entry.type !== "rest") {
      for (let k = 0; k < entryFrags.length; k++) {
        if (k > 0) entryFrags[k].tieStop = true
        if (k < entryFrags.length - 1) entryFrags[k].tieStart = true
      }
    }
  })

  if (current.length > 0) flush()
  if (measures.length === 0) measures.push([])
  return measures
}
