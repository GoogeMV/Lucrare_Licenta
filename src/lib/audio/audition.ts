import * as Tone from "tone"
import type { KeySignature, Pitch } from "@/types/score"
import { pitchToToneNote } from "@/lib/notation/pitch"
import { keyAccidentalMap } from "@/lib/notation/keySignature"
import { getInstrumentSound, type InstrumentSound } from "@/lib/audio/instruments"

// audiția: nota selectată sună pe DURATA EI reală (ca în MuseScore); când treci
// pe altă notă, sunetul curent e tăiat și pornește cel nou. `seconds` = durata
// notei la tempo-ul curent; lipsă = un preview scurt implicit.
const DEFAULT_AUDITION_SECONDS = 0.5
const MAX_AUDITION_SECONDS = 4

// vocea de audiție curentă. Folosim un sampler PARTAJAT (gata încărcat) și
// `triggerAttack` (FĂRĂ release automat) ca sursa să rămână urmăribilă: așa o
// putem tăia instant cu `releaseAll` la schimbarea notei. Un sampler nou per
// notă ar fi async și s-ar anula reciproc la navigare rapidă → tăcere.
let current: { sound: InstrumentSound; timer: number | null } | null = null
// crește la fiecare cerere — invalidează o audiție async rămasă în urmă
let generation = 0

/** Taie nota de audiție curentă (release imediat) și anulează timerul ei. */
function cutCurrent() {
  if (!current) return
  if (current.timer !== null) window.clearTimeout(current.timer)
  current.sound.releaseAll()
  current = null
}

/** Oprește audiția din afară (ex. la deselectare / pornirea redării). */
export function stopAudition() {
  generation += 1
  cutCurrent()
}

/**
 * Audiția la editare (ca în MuseScore): redă înălțimile date cu timbrul
 * instrumentului — la selectarea unei note, la transpunere, la alterații etc.
 * Nota selectată sună pe durata ei reală (`seconds`); când selectezi alta, audiția
 * nouă TAIE instantaneu nota anterioară (releaseAll), deci fără amânare și fără
 * suprapunere. Best-effort: dacă sunetul nu se încarcă sau audio-ul e blocat, tăcem.
 */
export async function auditionPitches(
  instrument: string,
  keySignature: KeySignature,
  pitches: Pitch[],
  seconds: number = DEFAULT_AUDITION_SECONDS,
) {
  if (pitches.length === 0) return
  const duration = Math.min(Math.max(seconds, 0.1), MAX_AUDITION_SECONDS)
  const gen = ++generation
  // tăiem nota anterioară imediat (înainte de orice await), ca să nu se suprapună
  cutCurrent()
  try {
    await Tone.start()
    const sound = await getInstrumentSound(instrument)
    // dacă între timp ai selectat altă notă, audiția asta e depășită
    if (gen !== generation) return
    const keyMap = keyAccidentalMap(keySignature)
    const notes = pitches.map((pitch) =>
      pitchToToneNote({ ...pitch, accidental: pitch.accidental ?? keyMap[pitch.step] }),
    )
    sound.triggerAttack(notes)
    // sfârșit natural după durata notei (dacă nu ai trecut deja pe alta)
    const timer = window.setTimeout(() => {
      if (gen === generation && current?.sound === sound) {
        sound.triggerRelease(notes)
        current = null
      }
    }, duration * 1000)
    current = { sound, timer }
  } catch {
    // audiția nu trebuie să strice niciodată editarea
  }
}
