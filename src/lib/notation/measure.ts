import type { Duration } from "@/types/score"
import { entryBeats } from "@/lib/notation/duration"

/**
 * Împarte o listă de note în măsuri (liste de indici în lista de note), pe
 * baza duratelor și a lungimii măsurii (`beatsPerMeasure`, în pătrimi).
 * Folosită atât la randare (InteractiveStave) cât și la export (MusicXML),
 * ca ambele să vadă exact aceeași împărțire pe măsuri.
 *
 * O notă mai lungă decât spațiul rămas trece în măsura următoare (măsurile
 * pot rămâne incomplete; nu facem încă legare cu "tie" peste bara de măsură).
 */
export function splitIntoMeasures(
  notes: { duration: Duration; dotted?: boolean }[],
  beatsPerMeasure: number,
): number[][] {
  const measures: number[][] = []
  let current: number[] = []
  let beats = 0

  notes.forEach((entry, i) => {
    const noteBeats = entryBeats(entry)
    if (current.length > 0 && beats + noteBeats > beatsPerMeasure + 1e-9) {
      measures.push(current)
      current = []
      beats = 0
    }
    current.push(i)
    beats += noteBeats
    if (beats >= beatsPerMeasure - 1e-9) {
      measures.push(current)
      current = []
      beats = 0
    }
  })
  if (current.length > 0) measures.push(current)
  if (measures.length === 0) measures.push([])
  return measures
}
