import type { Duration } from "@/types/score"

/** Codurile de durată folosite de VexFlow ("w", "h", "q", "8", "16") */
export const DURATION_TO_VEXFLOW: Record<Duration, string> = {
  whole: "w",
  half: "h",
  quarter: "q",
  eighth: "8",
  sixteenth: "16",
}

/** Câte pătrimi (beat-uri în 4/4) durează fiecare valoare */
export const DURATION_BEATS: Record<Duration, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
}

export const DURATION_LABELS: Record<Duration, string> = {
  whole: "Notă întreagă",
  half: "Doime",
  quarter: "Pătrime",
  eighth: "Optime",
  sixteenth: "Șaisprezecime",
}

export const DURATION_SYMBOLS: Record<Duration, string> = {
  whole: "𝅝",
  half: "𝅗𝅥",
  quarter: "♩",
  eighth: "♪",
  sixteenth: "𝅘𝅥𝅯",
}

export const DURATIONS: Duration[] = ["whole", "half", "quarter", "eighth", "sixteenth"]

/** Valorile de notă oferite ca unitate de bătaie pentru indicația de tempo
 *  (inclusiv variantele cu punct, ex. ♩. = 90 în 6/8) */
export const TEMPO_BEAT_CHOICES: { duration: Duration; dotted: boolean }[] = [
  { duration: "whole", dotted: false },
  { duration: "half", dotted: false },
  { duration: "half", dotted: true },
  { duration: "quarter", dotted: false },
  { duration: "quarter", dotted: true },
  { duration: "eighth", dotted: false },
  { duration: "eighth", dotted: true },
  { duration: "sixteenth", dotted: false },
]

/**
 * BPM efectiv în pătrimi pentru redare/metronom, separat de indicația notată:
 * numărul notat × valoarea unității de bătaie (în pătrimi, +50% dacă e cu punct)
 * × procentul de viteză de redare / 100. Ex. „♪ = 120" la 100% = 60 pătrimi/min.
 */
export function playbackQuarterBpm(
  notatedTempo: number,
  beat: Duration,
  beatDotted: boolean,
  ratePercent: number,
): number {
  return notatedTempo * DURATION_BEATS[beat] * (beatDotted ? 1.5 : 1) * (ratePercent / 100)
}

/**
 * Taste rapide pentru durate (ca în MuseScore — Q/W/E/R/T pe rândul de sus
 * al tastaturii): apăsarea uneia setează durata curentă de input și, dacă
 * există o notă selectată, îi schimbă imediat durata.
 */
export const DURATION_HOTKEYS: Record<string, Duration> = {
  q: "whole",
  w: "half",
  e: "quarter",
  r: "eighth",
  t: "sixteenth",
}

/** Eticheta tastei rapide asociate fiecărei durate (pentru tooltip-uri) */
export const DURATION_HOTKEY_LABELS: Record<Duration, string> = {
  whole: "Q",
  half: "W",
  quarter: "E",
  eighth: "R",
  sixteenth: "T",
}

/**
 * Taste rapide pentru pauze (rândul de jos al tastaturii, sub Q W E R T):
 * A/S/D/F/G inserează o pauză de durata corespunzătoare imediat după
 * elementul selectat — în oglindă cu tastele de durată pentru note.
 */
export const REST_HOTKEYS: Record<string, Duration> = {
  a: "whole",
  s: "half",
  d: "quarter",
  f: "eighth",
  g: "sixteenth",
}

export const REST_HOTKEY_LABELS: Record<Duration, string> = {
  whole: "A",
  half: "S",
  quarter: "D",
  eighth: "F",
  sixteenth: "G",
}

/** Codul de durată VexFlow pentru o intrare — adaugă sufixul "r" pentru pauze (ex. "qr") */
export function vexflowDurationCode(duration: Duration, isRest: boolean): string {
  const base = DURATION_TO_VEXFLOW[duration]
  return isRest ? `${base}r` : base
}

/** Durata efectivă a unei intrări, în pătrimi — punctul de prelungire adaugă 50% */
export function entryBeats(entry: { duration: Duration; dotted?: boolean }): number {
  return DURATION_BEATS[entry.duration] * (entry.dotted ? 1.5 : 1)
}
