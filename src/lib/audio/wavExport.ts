import * as Tone from "tone"
import { entryBeats } from "@/lib/notation/duration"
import { pitchToToneNote } from "@/lib/notation/pitch"
import { keyAccidentalMap } from "@/lib/notation/keySignature"
import { DEFAULT_VELOCITY, DYNAMIC_VELOCITY } from "@/lib/notation/dynamics"
import { createInstrument } from "@/lib/audio/instruments"
import type { PlaybackPart } from "@/lib/audio/playback"

// mic avans și coadă: notele pornesc puțin după 0, iar la final lăsăm sunetul
// (release/reverb) să se stingă, ca să nu fie tăiat brusc
const LEAD_SECONDS = 0.05
const TAIL_SECONDS = 1.5

/**
 * Randează partitura într-un fișier WAV, offline (mai repede decât în timp real).
 * Folosește aceeași logică de programare ca redarea live (`ScorePlayer`), dar
 * într-un `Tone.Offline` separat — de aceea instrumentele se construiesc proaspăt
 * în contextul offline (vezi `createInstrument`). Întoarce un Blob audio/wav.
 */
export async function renderScoreToWav(parts: PlaybackPart[], bpm: number): Promise<Blob> {
  const secondsPerBeat = 60 / bpm
  // durata totală = cel mai lung portativ (toate pornesc de la 0)
  let total = 0
  for (const part of parts) {
    let offset = 0
    for (const entry of part.notes) offset += entryBeats(entry) * secondsPerBeat
    total = Math.max(total, offset)
  }
  if (total <= 0) throw new Error("Nu există note de redat.")

  // deblocăm contextul audio (gest al utilizatorului) — necesar și pentru offline
  await Tone.start()

  const rendered = await Tone.Offline(async () => {
    const sounds = await Promise.all(parts.map((part) => createInstrument(part.instrument)))
    parts.forEach((part, partIndex) => {
      const sound = sounds[partIndex]
      const keyMap = keyAccidentalMap(part.keySignature)
      const staffMuted = part.muted ?? false
      const staffVolume = part.volume ?? 1
      let offset = 0
      let velocity = DEFAULT_VELOCITY
      for (const entry of part.notes) {
        const durationSeconds = entryBeats(entry) * secondsPerBeat
        if (entry.dynamic) velocity = DYNAMIC_VELOCITY[entry.dynamic]
        if (entry.type === "note" && !staffMuted) {
          const toneNotes = entry.pitches.map((pitch) =>
            pitchToToneNote({ ...pitch, accidental: pitch.accidental ?? keyMap[pitch.step] }),
          )
          const isStaccato = entry.articulations?.includes("staccato")
          const sounded = durationSeconds * (isStaccato ? 0.4 : 0.9)
          sound.triggerAttackRelease(toneNotes, sounded, LEAD_SECONDS + offset, velocity * staffVolume)
        }
        offset += durationSeconds
      }
    })
  }, total + LEAD_SECONDS + TAIL_SECONDS, 2)

  return audioBufferToWav(rendered.get() as AudioBuffer)
}

/** Codează un AudioBuffer ca fișier WAV PCM 16-bit (intercalat pe canale) */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign

  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  // antetul RIFF/WAVE
  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true) // dimensiunea sub-chunk-ului fmt
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // biți per eșantion
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  // eșantioanele, intercalate, convertite din float [-1,1] în int16
  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" })
}
