/**
 * Canal direct (pub/sub) între player și portativ pentru evidențierea notei
 * curente în timpul redării.
 *
 * De ce nu prin starea React: un dispatch per notă ar reconstrui întregul SVG
 * (toate portativele, toate măsurile) la fiecare notă redată — vizibil ca
 * sacadare pe partituri mari / tempo rapid. În timpul redării starea nu se
 * schimbă, deci elementele SVG rămân valide și pot fi recolorate direct.
 *
 * `durationSeconds` (durata notei la tempo-ul curent) e folosită de cursorul
 * vertical de redare ca să alunece continuu de la nota curentă spre următoarea.
 */

type HighlightListener = (noteId: string | null, durationSeconds?: number) => void

let listener: HighlightListener | null = null

/** Abonează portativul; întoarce funcția de dezabonare. */
export function onPlaybackHighlight(fn: HighlightListener): () => void {
  listener = fn
  return () => {
    if (listener === fn) listener = null
  }
}

/** Evidențiază nota cu id-ul dat (sau șterge evidențierea, cu `null`). */
export function emitPlaybackHighlight(noteId: string | null, durationSeconds?: number) {
  listener?.(noteId, durationSeconds)
}
