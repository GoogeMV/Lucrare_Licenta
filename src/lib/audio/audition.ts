import * as Tone from "tone"
import type { KeySignature, Pitch } from "@/types/score"
import { pitchToToneNote } from "@/lib/notation/pitch"
import { keyAccidentalMap } from "@/lib/notation/keySignature"
import { getInstrumentSound } from "@/lib/audio/instruments"

// preview scurt și constant la selectare (ca în MuseScore) — doar pentru a auzi
// înălțimea; durata reală se aude la redare
const DEFAULT_AUDITION_SECONDS = 0.4
const MAX_AUDITION_SECONDS = 3

/**
 * Audiția la editare (ca în MuseScore): redă scurt înălțimile date cu timbrul
 * instrumentului — la selectarea unei note, la transpunere, la alterații etc.
 * `seconds` reflectă durata notei (întreagă mai lung, șaisprezecime mai scurt);
 * lipsă = durata implicită scurtă. Suprapunerea la navigare rapidă e evitată
 * prin amânare (debounce) în InteractiveStave, nu prin tăierea sunetului.
 * Best-effort: dacă sunetul nu e încă încărcat sau audio-ul e blocat, tăcem.
 */
export async function auditionPitches(
  instrument: string,
  keySignature: KeySignature,
  pitches: Pitch[],
  seconds: number = DEFAULT_AUDITION_SECONDS,
) {
  if (pitches.length === 0) return
  const duration = Math.min(Math.max(seconds, 0.1), MAX_AUDITION_SECONDS)
  try {
    await Tone.start()
    const sound = await getInstrumentSound(instrument)
    const keyMap = keyAccidentalMap(keySignature)
    const notes = pitches.map((pitch) =>
      pitchToToneNote({ ...pitch, accidental: pitch.accidental ?? keyMap[pitch.step] }),
    )
    sound.triggerAttackRelease(notes, duration)
  } catch {
    // audiția nu trebuie să strice niciodată editarea
  }
}
