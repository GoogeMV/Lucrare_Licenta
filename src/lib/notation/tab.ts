import type { Pitch } from "@/types/score"
import { pitchSemitone, semitoneToPitch } from "@/lib/notation/pitch"

/**
 * Tablatură (TAB) pentru chitară: maparea înălțime ↔ (coardă, fret) pentru un
 * acordaj dat. TAB-ul nostru e o REPREZENTARE a acelorași note (pe înălțimi) —
 * fret-ul se calculează din înălțime și coarda aleasă; dacă nu e aleasă o
 * coardă, alegem automat fret-ul cel mai mic.
 */

export const MAX_FRET = 24

/**
 * Acordajele, ca înălțimi ale corzilor libere, ordonate de la coarda 1 (cea mai
 * înaltă/subțire) la ultima — convenția VexFlow (str 1 = linia de sus a TAB-ului).
 */
const GUITAR_OPEN: Pitch[] = [
  { step: "E", octave: 4 }, // 1
  { step: "B", octave: 3 }, // 2
  { step: "G", octave: 3 }, // 3
  { step: "D", octave: 3 }, // 4
  { step: "A", octave: 2 }, // 5
  { step: "E", octave: 2 }, // 6
]

const BASS_OPEN: Pitch[] = [
  { step: "G", octave: 2 }, // 1
  { step: "D", octave: 2 }, // 2
  { step: "A", octave: 1 }, // 3
  { step: "E", octave: 1 }, // 4
]

/** Adevărat pentru instrumentele care suportă TAB (chitarele) */
export function supportsTab(instrument: string): boolean {
  return instrument.startsWith("Chitară")
}

/** Înălțimile corzilor libere pentru un instrument (chitară bas = 4 corzi) */
export function tuningForInstrument(instrument: string): Pitch[] {
  return instrument === "Chitară bas" ? BASS_OPEN : GUITAR_OPEN
}

/** Numărul de corzi (linii TAB) ale instrumentului */
export function stringCountForInstrument(instrument: string): number {
  return tuningForInstrument(instrument).length
}

/** Înălțimea coardei libere `string` (1-indexat) a unui instrument */
export function openStringPitch(instrument: string, string: number): Pitch {
  const tuning = tuningForInstrument(instrument)
  return tuning[Math.min(Math.max(string, 1), tuning.length) - 1]
}

/** Maparea automată „fret minim": coarda cu cel mai înalt acord liber ≤ înălțime */
function autoPosition(semitone: number, tuningSemitones: number[]): { str: number; fret: number } {
  for (let i = 0; i < tuningSemitones.length; i++) {
    const fret = semitone - tuningSemitones[i]
    if (fret >= 0 && fret <= MAX_FRET) return { str: i + 1, fret }
  }
  // sub cea mai joasă coardă: o punem pe ultima coardă, fret clamp la 0
  const last = tuningSemitones.length
  return { str: last, fret: Math.max(0, semitone - tuningSemitones[last - 1]) }
}

/**
 * Poziția (coardă, fret) la care se desenează o înălțime în TAB. Dacă înălțimea
 * are o coardă aleasă explicit (și nota intră pe ea), o folosim; altfel mapare
 * automată pe fret-ul cel mai mic.
 */
export function tabPosition(pitch: Pitch, instrument: string): { str: number; fret: number } {
  const tuning = tuningForInstrument(instrument).map(pitchSemitone)
  const semitone = pitchSemitone(pitch)
  if (pitch.string && pitch.string >= 1 && pitch.string <= tuning.length) {
    const fret = semitone - tuning[pitch.string - 1]
    if (fret >= 0 && fret <= MAX_FRET) return { str: pitch.string, fret }
  }
  return autoPosition(semitone, tuning)
}

/**
 * Pozițiile (coardă, fret) pentru TOATE notele unui acord, garantând corzi
 * DISTINCTE — altfel două note s-ar desena pe aceeași coardă (suprapunere).
 * Onorăm întâi corzile alese explicit, apoi mapăm restul de la cea mai înaltă
 * la cea mai joasă pe prima coardă liberă jucabilă (subțiri → înalte, groase →
 * joase). Rezultatul păstrează ordinea din `pitches`. Pentru o singură notă e
 * identic cu `tabPosition`.
 */
export function tabPositionsForChord(
  pitches: Pitch[],
  instrument: string,
): { str: number; fret: number }[] {
  const tuning = tuningForInstrument(instrument).map(pitchSemitone)
  const used = new Set<number>()
  const result: ({ str: number; fret: number } | undefined)[] = new Array(pitches.length)

  // 1) corzile alese explicit (dacă nota intră pe ele și coarda e încă liberă)
  pitches.forEach((p, idx) => {
    if (p.string && p.string >= 1 && p.string <= tuning.length && !used.has(p.string)) {
      const fret = pitchSemitone(p) - tuning[p.string - 1]
      if (fret >= 0 && fret <= MAX_FRET) {
        result[idx] = { str: p.string, fret }
        used.add(p.string)
      }
    }
  })

  // 2) restul, de la înalt la jos: prima coardă liberă pe care nota e jucabilă
  const remaining = pitches
    .map((p, idx) => ({ p, idx }))
    .filter(({ idx }) => !result[idx])
    .sort((a, b) => pitchSemitone(b.p) - pitchSemitone(a.p))

  for (const { p, idx } of remaining) {
    const semitone = pitchSemitone(p)
    let assigned: { str: number; fret: number } | null = null
    for (let i = 0; i < tuning.length; i++) {
      if (used.has(i + 1)) continue
      const fret = semitone - tuning[i]
      if (fret >= 0 && fret <= MAX_FRET) {
        assigned = { str: i + 1, fret }
        break
      }
    }
    // degenerat (mai multe note decât corzi libere jucabile): cădem pe auto
    if (!assigned) assigned = autoPosition(semitone, tuning)
    result[idx] = assigned
    used.add(assigned.str)
  }

  return result as { str: number; fret: number }[]
}

/**
 * Înălțimea rezultată din apăsarea fret-ului `fret` pe coarda `string` a unui
 * instrument — cu coarda reținută în `string` (ca TAB-ul să rămână pe ea).
 */
export function pitchForStringFret(instrument: string, string: number, fret: number): Pitch {
  const open = openStringPitch(instrument, string)
  return { ...semitoneToPitch(pitchSemitone(open) + fret), string }
}
