import * as Tone from "tone"
import type { KeySignature, NoteEntry, TimeSignature } from "@/types/score"
import { DURATION_BEATS } from "@/lib/notation/duration"
import { pitchToToneNote } from "@/lib/notation/pitch"
import { keyAccidentalMap } from "@/lib/notation/keySignature"
import { beatSeconds } from "@/lib/notation/timeSignature"
import { CLICK_BEAT, CLICK_DOWNBEAT, CLICK_DURATION } from "@/lib/audio/metronome"

const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 }

/** Un portativ de redat: notele lui și armura proprie (poate diferi între portative) */
export interface PlaybackPart {
  notes: NoteEntry[]
  keySignature: KeySignature
}

export interface PlaybackOptions {
  /** Apelat când redarea ajunge la o intrare — folosit pentru a evidenția nota curentă */
  onNote?: (id: string) => void
  /** Apelat când redarea s-a terminat (sau a fost oprită prin atingerea finalului) */
  onEnd?: () => void
  /** Dacă e activ, programează și clicuri de metronom pe fiecare timp, aliniate la note */
  metronome?: boolean
  /** Indicația de măsură — determină ritmul și accentul clicurilor de metronom */
  timeSignature?: TimeSignature
  /** Indexul portativului a cărui notă curentă e evidențiată (implicit 0) */
  highlightPartIndex?: number
}

// mic avans înainte de prima notă, ca toate evenimentele audio să fie programate
// în viitor față de ceasul AudioContext (altfel Tone refuză timpii din trecut)
const LEAD_SECONDS = 0.1

/**
 * Redă o listă de note cu Tone.js. Modelul fiind monofonic (o singură voce),
 * notele sunt programate secvențial pe ceasul audio, iar evidențierea vizuală
 * a notei curente e sincronizată prin `setTimeout` aliniat la același avans.
 *
 * Un singur player e refolosit pe toată durata sesiunii — `play()` oprește
 * întotdeauna o redare anterioară înainte să pornească una nouă.
 */
export class ScorePlayer {
  private synth: Tone.PolySynth | null = null
  private clickSynth: Tone.MembraneSynth | null = null
  private timers: number[] = []
  private playing = false

  get isPlaying() {
    return this.playing
  }

  /**
   * Redă mai multe portative simultan: fiecare element din `parts` e lista de
   * note a unui portativ, pornind toate de la timpul 0. Evidențierea notei
   * curente (`onNote`) urmărește doar portativul indicat de `highlightPartIndex`.
   */
  async play(parts: PlaybackPart[], bpm: number, options: PlaybackOptions = {}) {
    // deblochează AudioContext-ul — trebuie apelat dintr-un gest al utilizatorului
    // (apăsarea butonului Play), altfel browserul nu pornește sunetul
    await Tone.start()
    this.stop()

    const totalNotes = parts.reduce((sum, part) => sum + part.notes.length, 0)
    if (totalNotes === 0) {
      options.onEnd?.()
      return
    }

    this.synth = new Tone.PolySynth(Tone.Synth).toDestination()
    this.synth.volume.value = -6
    this.playing = true

    const timeSignature = options.timeSignature ?? DEFAULT_TIME_SIGNATURE
    const secondsPerBeat = 60 / bpm // durata unei pătrimi (tempo în ♩)
    const startTime = Tone.now() + LEAD_SECONDS
    const highlightIndex = options.highlightPartIndex ?? 0

    let maxOffset = 0 // durata celui mai lung portativ (decide finalul redării)

    parts.forEach((part, partIndex) => {
      // fiecare portativ își aplică propria armură (instrumente transpozitorii)
      const keyMap = keyAccidentalMap(part.keySignature)
      let offset = 0 // în secunde, de la începutul redării, pentru acest portativ
      for (const entry of part.notes) {
        const durationSeconds = DURATION_BEATS[entry.duration] * secondsPerBeat

        if (entry.type === "note") {
          // o notă fără alterație explicită sună conform armurii (ex. Fa → Fa♯ în Sol major)
          const accidental = entry.pitch.accidental ?? keyMap[entry.pitch.step]
          const toneNote = pitchToToneNote({ ...entry.pitch, accidental })
          // staccato scurtează nota redată; restul notelor sună ~90% din durată
          const isStaccato = entry.articulations?.includes("staccato")
          const sounded = durationSeconds * (isStaccato ? 0.4 : 0.9)
          this.synth!.triggerAttackRelease(toneNote, sounded, startTime + offset)
        }

        // evidențiem nota curentă doar pentru portativul urmărit
        if (partIndex === highlightIndex) {
          const id = entry.id
          const timer = window.setTimeout(
            () => {
              if (this.playing) options.onNote?.(id)
            },
            (offset + LEAD_SECONDS) * 1000,
          )
          this.timers.push(timer)
        }

        offset += durationSeconds
      }
      maxOffset = Math.max(maxOffset, offset)
    })

    // clicuri de metronom pe fiecare timp, programate pe ACELAȘI ceas ca notele,
    // ca să cadă exact pe timpii melodiei (primul timp al măsurii — accentuat)
    if (options.metronome) {
      this.clickSynth = new Tone.MembraneSynth().toDestination()
      this.clickSynth.volume.value = -8
      const beatUnitSeconds = beatSeconds(timeSignature, bpm)
      const totalBeats = Math.ceil(maxOffset / beatUnitSeconds)
      for (let beat = 0; beat < totalBeats; beat++) {
        const isDownbeat = beat % timeSignature.numerator === 0
        this.clickSynth.triggerAttackRelease(
          isDownbeat ? CLICK_DOWNBEAT : CLICK_BEAT,
          CLICK_DURATION,
          startTime + beat * beatUnitSeconds,
        )
      }
    }

    // după ultima notă (cel mai lung portativ): marcăm finalul și eliberăm synth-urile
    const endTimer = window.setTimeout(
      () => {
        if (this.playing) {
          this.playing = false
          options.onEnd?.()
        }
        this.disposeSynth()
      },
      (maxOffset + LEAD_SECONDS) * 1000 + 150,
    )
    this.timers.push(endTimer)
  }

  stop() {
    this.playing = false
    this.timers.forEach((t) => window.clearTimeout(t))
    this.timers = []
    this.disposeSynth()
  }

  private disposeSynth() {
    if (this.synth) {
      this.synth.releaseAll()
      this.synth.dispose()
      this.synth = null
    }
    if (this.clickSynth) {
      this.clickSynth.dispose()
      this.clickSynth = null
    }
  }
}
