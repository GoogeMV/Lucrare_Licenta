import type { BarType, Duration, Staff, TimeSignature } from "@/types/score"

/**
 * Persistența partiturii în `localStorage` (un singur slot, versionat).
 * Salvăm doar modelul partiturii (portative + măsură) — nu și starea de UI
 * (selecții, mod de vizualizare) sau tempo-ul (deocamdată local în TransportBar).
 */

const STORAGE_KEY = "notation-app.score.v1"

export interface SavedScore {
  version: 1
  savedAt: string
  staves: Staff[]
  timeSignature: TimeSignature
  /** Bare speciale per index de măsură (repetiții etc.) — pot lipsi din salvări vechi */
  barlines?: Record<number, BarType>
  /** Metadate opționale (adăugate ulterior — pot lipsi din salvările vechi) */
  title?: string
  composer?: string
  tempo?: number
  /** Unitatea de bătaie a indicației de tempo (♩, ♪…) */
  tempoBeat?: Duration
  /** Dacă unitatea de bătaie are punct de prelungire (ex. ♩.) */
  tempoBeatDotted?: boolean
  /** Indicație liberă de tempo/expresie (ex. „Adagietto") */
  tempoText?: string
}

/** Salvează partitura; întoarce `false` dacă scrierea eșuează (ex. cotă plină) */
export function saveScore(
  staves: Staff[],
  timeSignature: TimeSignature,
  meta?: {
    title: string
    composer: string
    tempo: number
    tempoBeat: Duration
    tempoBeatDotted: boolean
    tempoText: string
  },
  barlines?: Record<number, BarType>,
): boolean {
  const payload: SavedScore = {
    version: 1,
    savedAt: new Date().toISOString(),
    staves,
    timeSignature,
    barlines,
    title: meta?.title,
    composer: meta?.composer,
    tempo: meta?.tempo,
    tempoBeat: meta?.tempoBeat,
    tempoBeatDotted: meta?.tempoBeatDotted,
    tempoText: meta?.tempoText,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

/** Încarcă partitura salvată, sau `null` dacă nu există / e coruptă */
export function loadScore(): SavedScore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedScore
    // validare minimă de formă — suficientă cât timp doar noi scriem cheia
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.staves) ||
      parsed.staves.length === 0 ||
      typeof parsed.timeSignature?.numerator !== "number" ||
      typeof parsed.timeSignature?.denominator !== "number"
    ) {
      return null
    }
    // migrare: salvările dinainte de acorduri aveau `pitch` singular pe intrare
    for (const staff of parsed.staves) {
      staff.notes = staff.notes.map((note) => {
        const legacy = note as { pitch?: { step: "C"; octave: number } } & typeof note
        if (!note.pitches && legacy.pitch) {
          return { ...note, pitches: [legacy.pitch] }
        }
        return note
      })
    }
    return parsed
  } catch {
    return null
  }
}

export function hasSavedScore(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}
