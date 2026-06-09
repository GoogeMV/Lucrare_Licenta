import type { Accidental } from "@/types/score"

/** Codul de alterație folosit de VexFlow ("b" bemol, "n" becar, "#" diez) */
export const ACCIDENTAL_TO_VEXFLOW: Record<Accidental, string> = {
  flat: "b",
  natural: "n",
  sharp: "#",
}

export const ACCIDENTAL_SYMBOLS: Record<Accidental, string> = {
  flat: "♭",
  natural: "♮",
  sharp: "♯",
}

export const ACCIDENTAL_LABELS: Record<Accidental, string> = {
  flat: "Bemol",
  natural: "Becar",
  sharp: "Diez",
}

/**
 * Taste rapide pentru alterații (lângă Enter, ca în MuseScore unde tastele
 * de paranteze din dreapta tastaturii sunt libere): apăsarea uneia, cu o
 * notă selectată, îi aplică (sau elimină, dacă e deja aplicată) alterația
 * corespunzătoare.
 */
export const ACCIDENTAL_HOTKEYS: Record<string, Accidental> = {
  "[": "flat",
  "]": "sharp",
  "\\": "natural",
}

export const ACCIDENTAL_HOTKEY_LABELS: Record<Accidental, string> = {
  flat: "[",
  sharp: "]",
  natural: "\\",
}
