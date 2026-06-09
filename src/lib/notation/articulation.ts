import type { Articulation } from "@/types/score"

/** Codul de articulație folosit de VexFlow (ex. "a." staccato, "a>" accent) */
export const ARTICULATION_TO_VEXFLOW: Record<Articulation, string> = {
  staccato: "a.",
  accent: "a>",
  tenuto: "a-",
  marcato: "a^",
}

/** Simbolul afișat pe butonul din toolbar */
export const ARTICULATION_SYMBOLS: Record<Articulation, string> = {
  staccato: "·",
  accent: "＞",
  tenuto: "–",
  marcato: "＾",
}

export const ARTICULATION_LABELS: Record<Articulation, string> = {
  staccato: "Staccato",
  accent: "Accent",
  tenuto: "Tenuto",
  marcato: "Marcato",
}

/** Articulațiile expuse în toolbar (în ordinea afișării) */
export const ARTICULATIONS: Articulation[] = ["accent", "staccato", "tenuto"]
