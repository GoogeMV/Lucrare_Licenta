import * as Tone from "tone"
import type { KeySignature, NoteEntry, TimeSignature } from "@/types/score"
import { entryBeats } from "@/lib/notation/duration"
import { pitchToToneNote } from "@/lib/notation/pitch"
import { keyAccidentalMap } from "@/lib/notation/keySignature"
import { beatSeconds } from "@/lib/notation/timeSignature"
import { DEFAULT_VELOCITY, DYNAMIC_VELOCITY } from "@/lib/notation/dynamics"
import { CLICK_BEAT, CLICK_DOWNBEAT, CLICK_DURATION } from "@/lib/audio/metronome"
import { createPlaybackSound, type InstrumentSound } from "@/lib/audio/instruments"

const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 }

/** Un portativ de redat: notele, armura proprie și instrumentul (timbrul) lui */
export interface PlaybackPart {
  notes: NoteEntry[]
  keySignature: KeySignature
  instrument: string
  /** Volumul din mixer (0–1, implicit 1) — scalează atacul fiecărei note */
  volume?: number
  /** Mut din mixer (implicit false) — portativul nu sună deloc */
  muted?: boolean
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
  /** Secunde de la începutul piesei de la care pornește redarea (reluare după pauză) */
  startOffset?: number
}

// mic avans înainte de prima notă, ca toate evenimentele audio să fie programate
// în viitor față de ceasul AudioContext (altfel Tone refuză timpii din trecut)
const LEAD_SECONDS = 0.1

/** Numărul total de bătăi (durata) unui portativ */
function partTotalBeats(part: PlaybackPart): number {
  return part.notes.reduce((sum, entry) => sum + entryBeats(entry), 0)
}

/**
 * Indexul portativului care se termină ULTIMUL (cele mai multe bătăi). Cursorul de
 * redare îl urmărește, ca să alunece până la finalul REAL al piesei — altfel, dacă
 * ar urmări un instrument mai scurt, s-ar opri când acela termină, deși restul mai
 * cântă. La egalitate de durată păstrăm portativul preferat (ex. cel activ).
 */
export function longestPartIndex(parts: PlaybackPart[], prefer = 0): number {
  let bestIdx = 0
  let bestBeats = -1
  parts.forEach((part, i) => {
    const beats = partTotalBeats(part)
    if (beats > bestBeats) {
      bestBeats = beats
      bestIdx = i
    }
  })
  if (prefer >= 0 && prefer < parts.length && partTotalBeats(parts[prefer]) >= bestBeats) {
    return prefer
  }
  return bestIdx
}

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
  /** timpul AudioContext la care a pornit redarea curentă (pentru calculul pauzei) */
  private startTime = 0
  /** offset-ul (secunde de la începutul piesei) de la care a pornit redarea curentă */
  private currentStartOffset = 0
  /** dacă redarea e pe pauză: offset-ul (secunde de la început) unde s-a oprit */
  private pausedOffset: number | null = null

  get isPlaying() {
    return this.playing
  }

  /** adevărat dacă redarea e pe pauză (oprită, dar cu poziție reținută) */
  get isPaused() {
    return this.pausedOffset != null
  }

  /** offset-ul (secunde de la început) de unde va relua un play() ulterior, sau 0 */
  get resumeOffset() {
    return this.pausedOffset ?? 0
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

    // sunete de unică folosință (prima dată descarcă eșantioanele; apoi din
    // cache-ul de buffere) — le distrugem la oprire ca să tăiem tot sunetul
    const sounds = await Promise.all(parts.map((part) => createPlaybackSound(part.instrument)))
    // dacă între timp s-a apăsat Stop sau alt Play, redarea asta nu mai pornește
    if (session !== this.session) {
      sounds.forEach((sound) => sound.dispose())
      options.onEnd?.()
      return
    }

    this.activeSounds = sounds
    this.playing = true

    const timeSignature = options.timeSignature ?? DEFAULT_TIME_SIGNATURE
    const secondsPerBeat = 60 / bpm // durata unei pătrimi (tempo în ♩)
    const startTime = Tone.now() + LEAD_SECONDS
    const highlightIndex = options.highlightPartIndex ?? 0
    // punctul de pornire în piesă (>0 la reluarea după pauză)
    const startOffset = options.startOffset ?? 0
    this.startTime = startTime
    this.currentStartOffset = startOffset

    let maxOffset = 0 // durata celui mai lung portativ (decide finalul redării)

    parts.forEach((part, partIndex) => {
      const sound = sounds[partIndex]
      // fiecare portativ își aplică propria armură (instrumente transpozitorii)
      const keyMap = keyAccidentalMap(part.keySignature)
      // volumul din mixer: mut → nu sună deloc; altfel scalează atacul notelor
      const staffMuted = part.muted ?? false
      const staffVolume = part.volume ?? 1
      let offset = 0 // în secunde, de la începutul redării, pentru acest portativ
      // volumul curent (nuanța în vigoare) — fiecare nuanță întâlnită îl schimbă
      // și rămâne până la următoarea, ca în notația tipărită
      let velocity = DEFAULT_VELOCITY
      for (const entry of part.notes) {
        const durationSeconds = entryBeats(entry) * secondsPerBeat
        // nuanța în vigoare se actualizează ÎNAINTE de eventuala sărire, ca
        // reluarea după pauză să pornească cu velocitatea corectă
        if (entry.dynamic) velocity = DYNAMIC_VELOCITY[entry.dynamic]
        const noteEnd = offset + durationSeconds

        // la reluare după pauză, sărim notele deja redate complet
        if (noteEnd > startOffset) {
          // decalajul față de punctul de reluare: pozitiv pentru notele viitoare,
          // 0 pentru nota aflată în curs de redare când s-a apăsat pauză
          const localStart = Math.max(0, offset - startOffset)
          // cât din notă s-a scurs deja (>0 doar pentru nota tăiată de pauză)
          const elapsedInNote = Math.max(0, startOffset - offset)

          if (entry.type === "note" && !staffMuted) {
            // toate înălțimile intrării (acord) — fără alterație explicită,
            // fiecare sună conform armurii (ex. Fa → Fa♯ în Sol major)
            const toneNotes = entry.pitches.map((pitch) =>
              pitchToToneNote({ ...pitch, accidental: pitch.accidental ?? keyMap[pitch.step] }),
            )
            // staccato scurtează nota redată; restul notelor sună ~90% din durată
            const isStaccato = entry.articulations?.includes("staccato")
            const sounded = durationSeconds * (isStaccato ? 0.4 : 0.9) - elapsedInNote
            if (sounded > 0.01)
              sound.triggerAttackRelease(toneNotes, sounded, startTime + localStart, velocity * staffVolume)
          }

          // evidențiem nota curentă doar pentru portativul urmărit
          if (partIndex === highlightIndex) {
            const id = entry.id
            const noteSeconds = durationSeconds - elapsedInNote
            const timer = window.setTimeout(
              () => {
                if (this.playing) options.onNote?.(id, noteSeconds)
              },
              (localStart + LEAD_SECONDS) * 1000,
            )
            this.timers.push(timer)
          }
        }

        offset = noteEnd
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
        const beatTime = beat * beatUnitSeconds
        // la reluare după pauză, sărim clicurile deja consumate
        if (beatTime < startOffset - 1e-6) continue
        const isDownbeat = beat % timeSignature.numerator === 0
        this.clickSynth.triggerAttackRelease(
          isDownbeat ? CLICK_DOWNBEAT : CLICK_BEAT,
          CLICK_DURATION,
          startTime + (beatTime - startOffset),
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
      (maxOffset - startOffset + LEAD_SECONDS) * 1000 + 150,
    )
    this.timers.push(endTimer)
  }

  /**
   * Pune redarea pe pauză, reținând poziția curentă în piesă, astfel încât un
   * `play()` ulterior cu `startOffset = resumeOffset` să continue de acolo.
   * Spre deosebire de `stop()`, NU șterge poziția reținută.
   */
  pause() {
    if (!this.playing) return
    // timpul scurs din piesă = (acum − startul redării curente) + offsetul de pornire
    const elapsed = Tone.now() - this.startTime + this.currentStartOffset
    this.session += 1
    this.playing = false
    this.timers.forEach((t) => window.clearTimeout(t))
    this.timers = []
    this.releaseSounds()
    this.pausedOffset = Math.max(0, elapsed)
  }

  stop() {
    this.session += 1
    this.playing = false
    this.pausedOffset = null
    this.timers.forEach((t) => window.clearTimeout(t))
    this.timers = []
    this.releaseSounds()
  }

  private releaseSounds() {
    // sunetele redării sunt de unică folosință — le DISTRUGEM, ca să tăiem inclusiv
    // notele deja programate pe ceasul audio (releaseAll nu le-ar mai prinde)
    this.activeSounds.forEach((sound) => sound.dispose())
    this.activeSounds = []
    if (this.clickSynth) {
      this.clickSynth.dispose()
      this.clickSynth = null
    }
  }
}
