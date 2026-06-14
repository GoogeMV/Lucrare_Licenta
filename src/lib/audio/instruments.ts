import * as Tone from "tone"

/**
 * Sunete reale de instrumente: `Tone.Sampler` peste eșantioane înregistrate
 * (biblioteca tonejs-instruments, găzduită pe GitHub Pages, cu CORS deschis).
 * Sampler-ul interpolează între notele-ancoră eșantionate, deci nu avem nevoie
 * de toate înălțimile — doar de câteva puncte pe întinderea instrumentului
 * (toate URL-urile de mai jos au fost verificate că există).
 *
 * Eșantioanele se încarcă leneș (la primul Play) și se păstrează în cache pe
 * toată sesiunea. Dacă încărcarea eșuează (ex. fără internet), cădem pe un
 * sintetizator generic, ca redarea să funcționeze întotdeauna.
 */

const SAMPLE_BASE_URL = "https://nbrosowsky.github.io/tonejs-instruments/samples"
const LOAD_TIMEOUT_MS = 20_000

/** Notele-ancoră eșantionate, per familie de sunet (diezii: "A#3" → "As3.mp3") */
const SAMPLE_SETS: Record<string, Record<string, string>> = {
  violin: { A3: "A3.mp3", C4: "C4.mp3", E4: "E4.mp3", G4: "G4.mp3", A4: "A4.mp3", C5: "C5.mp3", E5: "E5.mp3", G5: "G5.mp3", C6: "C6.mp3" },
  cello: { C2: "C2.mp3", E2: "E2.mp3", G2: "G2.mp3", A2: "A2.mp3", C3: "C3.mp3", E3: "E3.mp3", G3: "G3.mp3", A3: "A3.mp3", C4: "C4.mp3" },
  contrabass: { G1: "G1.mp3", C2: "C2.mp3", E2: "E2.mp3", A2: "A2.mp3" },
  flute: { C4: "C4.mp3", E4: "E4.mp3", A4: "A4.mp3", C5: "C5.mp3", E5: "E5.mp3", A5: "A5.mp3", C6: "C6.mp3" },
  clarinet: { D3: "D3.mp3", "A#3": "As3.mp3", D4: "D4.mp3", F4: "F4.mp3", "A#4": "As4.mp3", D5: "D5.mp3", F5: "F5.mp3" },
  bassoon: { A2: "A2.mp3", C3: "C3.mp3", G3: "G3.mp3", A3: "A3.mp3", C4: "C4.mp3" },
  trumpet: { A3: "A3.mp3", C4: "C4.mp3", F4: "F4.mp3", G4: "G4.mp3", "A#4": "As4.mp3", D5: "D5.mp3" },
  "french-horn": { A1: "A1.mp3", D3: "D3.mp3", F3: "F3.mp3", A3: "A3.mp3", C4: "C4.mp3" },
  trombone: { F2: "F2.mp3", "A#2": "As2.mp3", C3: "C3.mp3", D3: "D3.mp3", F3: "F3.mp3", "A#3": "As3.mp3" },
  tuba: { F1: "F1.mp3", "A#1": "As1.mp3", F2: "F2.mp3", "A#2": "As2.mp3", D3: "D3.mp3" },
  piano: { C2: "C2.mp3", C3: "C3.mp3", G3: "G3.mp3", A3: "A3.mp3", C4: "C4.mp3", E4: "E4.mp3", G4: "G4.mp3", C5: "C5.mp3", G5: "G5.mp3", C6: "C6.mp3" },
  organ: { A1: "A1.mp3", C2: "C2.mp3", A2: "A2.mp3", C3: "C3.mp3", A3: "A3.mp3", C4: "C4.mp3", A4: "A4.mp3", C5: "C5.mp3", C6: "C6.mp3" },
  "guitar-acoustic": { A2: "A2.mp3", C3: "C3.mp3", E3: "E3.mp3", G3: "G3.mp3", C4: "C4.mp3", E4: "E4.mp3", G4: "G4.mp3", C5: "C5.mp3" },
  "guitar-electric": { A2: "A2.mp3", C3: "C3.mp3", "F#3": "Fs3.mp3", A3: "A3.mp3", C4: "C4.mp3", "F#4": "Fs4.mp3", A4: "A4.mp3", C5: "C5.mp3" },
  "guitar-nylon": { A2: "A2.mp3", "C#3": "Cs3.mp3", E3: "E3.mp3", A3: "A3.mp3", "C#4": "Cs4.mp3", E4: "E4.mp3", A4: "A4.mp3" },
  "bass-electric": { E1: "E1.mp3", G1: "G1.mp3", "A#1": "As1.mp3", "C#2": "Cs2.mp3", E2: "E2.mp3", G2: "G2.mp3", "A#2": "As2.mp3", E3: "E3.mp3", G3: "G3.mp3" },
}

/**
 * Maparea instrumentelor din paletă pe familiile de eșantioane. Pentru cele
 * fără eșantioane proprii folosim timbrul cel mai apropiat disponibil:
 * violă → vioară, oboi → clarinet, pian electric → pian.
 */
const INSTRUMENT_SAMPLE_FAMILY: Record<string, string> = {
  Vioară: "violin",
  Violă: "violin",
  Violoncel: "cello",
  Contrabas: "contrabass",
  Flaut: "flute",
  Oboi: "clarinet",
  Clarinet: "clarinet",
  Fagot: "bassoon",
  Trompetă: "trumpet",
  Corn: "french-horn",
  Trombon: "trombone",
  Tubă: "tuba",
  Pian: "piano",
  "Pian electric": "piano",
  Orgă: "organ",
  Chitară: "guitar-acoustic",
  "Chitară electrică": "guitar-electric",
  "Chitară clasică": "guitar-nylon",
  "Chitară bas": "bass-electric",
  // corul nu are eșantioane pe CDN — îl redăm sintetic („aaa", vezi createChoirSynth)
  "Voce (cor)": "choir",
}

/** Interfața comună folosită de player (Sampler și PolySynth o au amândouă) */
export interface InstrumentSound {
  triggerAttackRelease(
    notes: string | string[],
    duration: number,
    time?: number,
    /** Volumul atacului (0–1) — folosit pentru nuanțe (p/f); implicit maxim */
    velocity?: number,
  ): unknown
  releaseAll(): unknown
}

// cache per familie (Vioară + Violă împart aceleași eșantioane de vioară)
const soundCache = new Map<string, Promise<InstrumentSound>>()

function createFallbackSynth(): InstrumentSound {
  const synth = new Tone.PolySynth(Tone.Synth).toDestination()
  synth.volume.value = -6
  return synth
}

/**
 * Cor sintetic (timbru vocal „aaa") — biblioteca de eșantioane nu are voci, deci
 * îl construim din sinteză, ca „Voice Aahs" din MuseScore: o undă sawtooth
 * (bogată în armonice, ca vocea umană) înmuiată cu un filtru lowpass, vibrato
 * ușor (senzație de cântăreț) și o urmă de reverb (ansamblu/sală). Cântă
 * înălțimea fiecărei note — versurile rămân doar text, nu sunt rostite.
 */
function createChoirSynth(): InstrumentSound {
  const synth = new Tone.PolySynth(Tone.Synth)
  synth.set({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.35, decay: 0.2, sustain: 0.85, release: 0.6 },
  })
  const filter = new Tone.Filter({ type: "lowpass", frequency: 1900, Q: 0.4 })
  const vibrato = new Tone.Vibrato({ frequency: 5, depth: 0.06 })
  const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.25 })
  synth.chain(filter, vibrato, reverb, Tone.getDestination())
  synth.volume.value = -9
  return synth
}

function loadSampler(family: string): Promise<InstrumentSound> {
  if (family === "choir") return Promise.resolve(createChoirSynth())
  const urls = SAMPLE_SETS[family]
  if (!urls) return Promise.resolve(createFallbackSynth())

  const load = new Promise<InstrumentSound>((resolve, reject) => {
    const sampler = new Tone.Sampler({
      urls,
      baseUrl: `${SAMPLE_BASE_URL}/${family}/`,
      release: 0.3,
      onload: () => resolve(sampler),
      onerror: (error) => reject(error),
    }).toDestination()
    sampler.volume.value = -4
  })
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error(`timeout la încărcarea eșantioanelor "${family}"`)), LOAD_TIMEOUT_MS)
  })

  return Promise.race([load, timeout])
}

/**
 * Sunetul pentru un instrument din paletă — eșantioane reale, cu cache pe
 * sesiune; la eșec (offline/CDN căzut) întoarce sintetizatorul generic.
 */
export function getInstrumentSound(instrument: string): Promise<InstrumentSound> {
  const family = INSTRUMENT_SAMPLE_FAMILY[instrument] ?? "piano"
  let cached = soundCache.get(family)
  if (!cached) {
    cached = loadSampler(family).catch((error) => {
      console.warn(`Eșantioanele pentru "${family}" nu s-au încărcat — folosim sintetizatorul generic.`, error)
      return createFallbackSynth()
    })
    soundCache.set(family, cached)
  }
  return cached
}
