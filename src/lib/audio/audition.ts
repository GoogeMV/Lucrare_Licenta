import * as Tone from "tone"
import type { KeySignature, Pitch } from "@/types/score"
import { pitchToToneNote } from "@/lib/notation/pitch"
import { keyAccidentalMap } from "@/lib/notation/keySignature"
import { createPlaybackSound, type InstrumentSound } from "@/lib/audio/instruments"

// audiția: nota selectată sună pe DURATA EI reală (ca în MuseScore); când treci
// pe altă notă, sunetul curent e tăiat și pornește cel nou. `seconds` = durata
// notei la tempo-ul curent; lipsă = un preview scurt implicit.
const DEFAULT_AUDITION_SECONDS = 0.5
const MAX_AUDITION_SECONDS = 4
// coada de release a sampler-ului — o adăugăm la curățarea automată
const RELEASE_TAIL_SECONDS = 0.3

// vocea de audiție curentă: o ținem ca să o putem TĂIA (dispose) când selectezi
// alta — `releaseAll` n-ar funcționa (Tone golește lista de surse la programare,
// vezi ScorePlayer), deci singura tăiere reală e dispose pe un sunet de unică
// folosință. Generația invalidează audițiile rămase în urmă la navigare rapidă.
let currentSound: InstrumentSound | null = null
let disposeTimer: number | null = null
let generation = 0

/** Taie imediat audiția curentă (oprește sunetul și anulează auto-disposal-ul). */
function cutAudition() {
  if (disposeTimer !== null) {
    window.clearTimeout(disposeTimer)
    disposeTimer = null
  }
  if (currentSound) {
    currentSound.dispose()
    currentSound = null
  }
}

/**
 * Audiția la editare (ca în MuseScore): redă înălțimile date cu timbrul
 * instrumentului — la selectarea unei note, la transpunere, la alterații etc.
 * Nota selectată sună pe durata ei reală (`seconds`); când selectezi alta, audiția
 * nouă TAIE instantaneu nota anterioară (dispose), deci fără amânare și fără
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
  // tăiem nota anterioară înainte de a o porni pe asta (instant, fără pile-up)
  cutAudition()
  try {
    await Tone.start()
    const sound = await createPlaybackSound(instrument)
    // dacă între timp ai selectat altă notă, audiția asta e depășită — o aruncăm
    if (gen !== generation) {
      sound.dispose()
      return
    }
    const keyMap = keyAccidentalMap(keySignature)
    const notes = pitches.map((pitch) =>
      pitchToToneNote({ ...pitch, accidental: pitch.accidental ?? keyMap[pitch.step] }),
    )
    sound.triggerAttackRelease(notes, duration)
    currentSound = sound
    // curățare după ce nota s-a stins natural (durata ei + coada de release);
    // dacă selectezi alta înainte, cutAudition() o oprește oricum mai devreme
    disposeTimer = window.setTimeout(() => {
      if (gen === generation) cutAudition()
    }, (duration + RELEASE_TAIL_SECONDS) * 1000)
  } catch {
    // audiția nu trebuie să strice niciodată editarea
  }
}
