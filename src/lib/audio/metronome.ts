import * as Tone from "tone"
import type { TimeSignature } from "@/types/score"
import { toneBeatSubdivision } from "@/lib/notation/timeSignature"

/** Sunetul unui clic de metronom (timbru de tobă scurt) */
export const CLICK_DOWNBEAT = "C3" // timpul 1 al măsurii — accentuat (mai înalt)
export const CLICK_BEAT = "C2" // restul timpilor
export const CLICK_DURATION = "16n"

/**
 * Metronom de sine stătător: bate câte un clic pe fiecare timp (unitatea =
 * numitorul măsurii), la tempo-ul dat, cu primul timp al fiecărei măsuri
 * accentuat. Folosește `Tone.Transport` + `Tone.Loop` ca bătaia să fie precisă
 * pe ceasul audio.
 *
 * Pentru clicurile din timpul redării (aliniate la note) vezi `ScorePlayer` —
 * acolo clicurile sunt programate pe același ceas ca notele, ca să cadă exact
 * pe timpii melodiei.
 */
export class Metronome {
  private synth: Tone.MembraneSynth | null = null
  private loop: Tone.Loop | null = null

  async start(bpm: number, timeSignature: TimeSignature) {
    // deblochează AudioContext-ul (apelat dintr-un gest al utilizatorului)
    await Tone.start()
    this.stop()

    this.synth = new Tone.MembraneSynth().toDestination()
    this.synth.volume.value = -8

    const transport = Tone.getTransport()
    transport.bpm.value = bpm

    let beat = 0
    this.loop = new Tone.Loop((time) => {
      const isDownbeat = beat % timeSignature.numerator === 0
      this.synth?.triggerAttackRelease(isDownbeat ? CLICK_DOWNBEAT : CLICK_BEAT, CLICK_DURATION, time)
      beat += 1
    }, toneBeatSubdivision(timeSignature)).start(0)

    transport.start()
  }

  stop() {
    if (this.loop) {
      this.loop.stop()
      this.loop.dispose()
      this.loop = null
    }
    // nimic altceva nu folosește Transport-ul, deci îl putem opri în siguranță
    Tone.getTransport().stop()
    if (this.synth) {
      this.synth.dispose()
      this.synth = null
    }
  }
}
