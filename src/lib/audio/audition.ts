import * as Tone from "tone"
import type { KeySignature, Pitch } from "@/types/score"
import { pitchToToneNote } from "@/lib/notation/pitch"
import { keyAccidentalMap } from "@/lib/notation/keySignature"
import { getInstrumentSound } from "@/lib/audio/instruments"

const AUDITION_SECONDS = 0.35

/**
 * Audiția la editare (ca în MuseScore): redă scurt înălțimile date cu timbrul
 * instrumentului — la selectarea unei note, la transpunere, la alterații etc.
 * Best-effort: dacă sunetul nu e încă încărcat sau audio-ul e blocat, tăcem.
 * (Apelată mereu dintr-un gest al utilizatorului, deci Tone.start() e permis.)
 */
export async function auditionPitches(
  instrument: string,
  keySignature: KeySignature,
  pitches: Pitch[],
) {
  if (pitches.length === 0) return
  try {
    await Tone.start()
    const sound = await getInstrumentSound(instrument)
    const keyMap = keyAccidentalMap(keySignature)
    const notes = pitches.map((pitch) =>
      pitchToToneNote({ ...pitch, accidental: pitch.accidental ?? keyMap[pitch.step] }),
    )
    sound.triggerAttackRelease(notes, AUDITION_SECONDS)
  } catch {
    // audiția nu trebuie să strice niciodată editarea
  }
}
