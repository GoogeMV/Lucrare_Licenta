import type { Dynamic } from "@/types/score"

/** Nuanțele expuse în toolbar, de la cea mai slabă la cea mai tare */
export const DYNAMICS: Dynamic[] = ["pp", "p", "mp", "mf", "f", "ff"]

/** Eticheta lizibilă a fiecărei nuanțe (pentru tooltip) */
export const DYNAMIC_LABELS: Record<Dynamic, string> = {
  pp: "Pianissimo — foarte încet",
  p: "Piano — încet",
  mp: "Mezzo-piano — moderat de încet",
  mf: "Mezzo-forte — moderat de tare",
  f: "Forte — tare",
  ff: "Fortissimo — foarte tare",
}

/**
 * Volumul (velocity 0–1, folosit de Tone.js la atac) corespunzător fiecărei
 * nuanțe — o scară aproximativ liniară de la pianissimo la fortissimo.
 */
export const DYNAMIC_VELOCITY: Record<Dynamic, number> = {
  pp: 0.25,
  p: 0.4,
  mp: 0.55,
  mf: 0.7,
  f: 0.85,
  ff: 1,
}

/** Volumul implicit (mezzo-forte) cât timp nicio nuanță nu e încă în vigoare */
export const DEFAULT_VELOCITY = DYNAMIC_VELOCITY.mf

/** Eticheta MusicXML a fiecărei nuanțe (numele tag-ului din `<dynamics>`) */
export const DYNAMIC_MUSICXML_TAGS: Record<Dynamic, string> = {
  pp: "pp",
  p: "p",
  mp: "mp",
  mf: "mf",
  f: "f",
  ff: "ff",
}
