import * as Tone from "tone"
import type { KeySignature, NoteEntry, TimeSignature } from "@/types/score"
import { entryBeats } from "@/lib/notation/duration"
import { pitchToToneNote } from "@/lib/notation/pitch"
import { keyAccidentalMap } from "@/lib/notation/keySignature"
import { beatSeconds } from "@/lib/notation/timeSignature"
import { CLICK_BEAT, CLICK_DOWNBEAT, CLICK_DURATION } from "@/lib/audio/metronome"
import { getInstrumentSound, type InstrumentSound } from "@/lib/audio/instruments"

const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 }

/** Un portativ de redat: notele, armura proprie și instrumentul (timbrul) lui */
export interface PlaybackPart {
  notes: NoteEntry[]
  keySignature: KeySignature
  instrument: string
}

export interface PlaybackOptions {
  /** Apelat când redarea ajunge la o intrare — primește id-ul și durata ei în
   *  secunde (la tempo-ul curent), folosite de evidențiere și de cursorul animat */
  onNote?: (id: string, durationSeconds: number) => void
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
  /** sunetele folosite de redarea curentă (din cache-ul de instrumente — nu se distrug) */
  private activeSounds: InstrumentSound[] = []
  private clickSynth: Tone.MembraneSynth | null = null
  private timers: number[] = []
  private playing = false
  /** crește la fiecare play/stop — invalidează redările rămase în încărcare */
  private session = 0

  get isPlaying() {
    return this.playing
  }

  /**
   * Redă mai multe portative simultan: fiecare element din `parts` e lista de
   * note a unui portativ, pornind toate de la timpul 0, fiecare cu timbrul
   * instrumentului său (eșantioane reale, încărcate leneș la primul Play).
   * Evidențierea notei curente urmărește portativul `highlightPartIndex`.
   */
  async play(parts: PlaybackPart[], bpm: number, options: PlaybackOptions = {}) {
    this.stop()
    const session = ++this.session

    // deblochează AudioContext-ul — trebuie apelat dintr-un gest al utilizatorului
    // (apăsarea butonului Play), altfel browserul nu pornește sunetul
    await Tone.start()

    const totalNotes = parts.reduce((sum, part) => sum + part.notes.length, 0)
    if (totalNotes === 0) {
      options.onEnd?.()
      return
    }

    // sunetele instrumentelor (prima dată descarcă eșantioanele; apoi, din cache)
    const sounds = await Promise.all(parts.map((part) => getInstrumentSound(part.instrument)))
    // dacă între timp s-a apăsat Stop sau alt Play, redarea asta nu mai pornește
    if (session !== this.session) {
      options.onEnd?.()
      return
    }

    this.activeSounds = sounds
    this.playing = true

    const timeSignature = options.timeSignature ?? DEFAULT_TIME_SIGNATURE
    const secondsPerBeat = 60 / bpm // durata unei pătrimi (tempo în ♩)
    const startTime = Tone.now() + LEAD_SECONDS
    const highlightIndex = options.highlightPartIndex ?? 0

    let maxOffset = 0 // durata celui mai lung portativ (decide finalul redării)

    parts.forEach((part, partIndex) => {
      const sound = sounds[partIndex]
      // fiecare portativ își aplică propria armură (instrumente transpozitorii)
      const keyMap = keyAccidentalMap(part.keySignature)
      let offset = 0 // în secunde, de la începutul redării, pentru acest portativ
      for (const entry of part.notes) {
        const durationSeconds = entryBeats(entry) * secondsPerBeat

        if (entry.type === "note") {
          // toate înălțimile intrării (acord) — fără alterație explicită,
          // fiecare sună conform armurii (ex. Fa → Fa♯ în Sol major)
          const toneNotes = entry.pitches.map((pitch) =>
            pitchToToneNote({ ...pitch, accidental: pitch.accidental ?? keyMap[pitch.step] }),
          )
          // staccato scurtează nota redată; restul notelor sună ~90% din durată
          const isStaccato = entry.articulations?.includes("staccato")
          const sounded = durationSeconds * (isStaccato ? 0.4 : 0.9)
          sound.triggerAttackRelease(toneNotes, sounded, startTime + offset)
        }

        // evidențiem nota curentă doar pentru portativul urmărit
        if (partIndex === highlightIndex) {
          const id = entry.id
          const noteSeconds = durationSeconds
          const timer = window.setTimeout(
            () => {
              if (this.playing) options.onNote?.(id, noteSeconds)
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

    // după ultima notă (cel mai lung portativ): marcăm finalul și curățăm
    const endTimer = window.setTimeout(
      () => {
        if (this.playing) {
          this.playing = false
          options.onEnd?.()
        }
        this.releaseSounds()
      },
      (maxOffset + LEAD_SECONDS) * 1000 + 150,
    )
    this.timers.push(endTimer)
  }

  stop() {
    this.session += 1
    this.playing = false
    this.timers.forEach((t) => window.clearTimeout(t))
    this.timers = []
    this.releaseSounds()
  }

  private releaseSounds() {
    // sunetele instrumentelor sunt în cache pe sesiune — doar le oprim, nu le distrugem
    this.activeSounds.forEach((sound) => sound.releaseAll())
    this.activeSounds = []
    if (this.clickSynth) {
      this.clickSynth.dispose()
      this.clickSynth = null
    }
  }
}
