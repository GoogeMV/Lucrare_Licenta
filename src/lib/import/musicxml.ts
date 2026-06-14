import type {
  Articulation,
  Clef,
  Duration,
  Dynamic,
  KeySignature,
  NoteEntry,
  Pitch,
  Staff,
  Step,
  TimeSignature,
} from "@/types/score"
import { nextGroupId, nextId, nextStaffId } from "@/state/scoreReducer"
import { pitchIndex } from "@/lib/notation/pitch"
import { decompose } from "@/lib/notation/measure"
import { DYNAMICS } from "@/lib/notation/dynamics"
import { KEY_SIGNATURES, keyFifths } from "@/lib/notation/keySignature"

/**
 * Import MusicXML (score-partwise) → modelul intern. Perechea exportului din
 * `lib/export/musicxml.ts`: citește titlu/compozitor/tempo, măsură, armură,
 * cheie, note/acorduri/pauze, durate (inclusiv punct și triolete), alterații,
 * articulații, legato, nuanțe și versuri. Un `<part>` cu două portative (sistem
 * de pian) devine două portative legate prin acoladă.
 *
 * Limitări asumate (lucrare de licență):
 *  - o singură voce per portativ (vocile secundare sunt ignorate);
 *  - notele legate (tie) se importă ca intrări separate (re-atac), fiindcă
 *    modelul nu stochează ligaturi arbitrare — doar le re-generează la randare
 *    pentru notele care depășesc bara;
 *  - se ia prima măsură/armură/tempo întâlnite (fără schimbări la mijloc);
 *  - doar MusicXML necomprimat (.musicxml/.xml), nu .mxl (zip).
 */

export interface ImportedScore {
  staves: Staff[]
  timeSignature: TimeSignature
  meta: {
    title: string
    composer: string
    tempo: number
    tempoBeat: Duration
    tempoBeatDotted: boolean
    tempoText: string
  }
}

// --- mapări inverse față de export ---

const TYPE_TO_DURATION: Record<string, Duration> = {
  whole: "whole",
  half: "half",
  quarter: "quarter",
  eighth: "eighth",
  "16th": "sixteenth",
  // mai mari / mai mici decât gama noastră — aproximăm la capete
  breve: "whole",
  long: "whole",
  "32nd": "sixteenth",
  "64th": "sixteenth",
  "128th": "sixteenth",
}

const ARTICULATION_FROM_XML: Record<string, Articulation> = {
  staccato: "staccato",
  accent: "accent",
  tenuto: "tenuto",
  "strong-accent": "marcato",
}

const ACCIDENTAL_FROM_XML: Record<string, Pitch["accidental"]> = {
  sharp: "sharp",
  flat: "flat",
  natural: "natural",
}

// fifths (poziția pe cercul cvintelor) → tonalitatea noastră (ex. 2 → "D", -2 → "Bb")
const FIFTHS_TO_KEY = new Map<number, KeySignature>(
  KEY_SIGNATURES.map(({ spec }) => [keyFifths(spec), spec]),
)

// nume de instrument străine/uzuale → instrumentele noastre (pentru timbru +
// etichetă corecte la importul fișierelor din alte aplicații)
const INSTRUMENT_ALIASES: Record<string, string> = {
  violin: "Vioară",
  viola: "Violă",
  cello: "Violoncel",
  violoncello: "Violoncel",
  contrabass: "Contrabas",
  "double bass": "Contrabas",
  flute: "Flaut",
  oboe: "Oboi",
  clarinet: "Clarinet",
  bassoon: "Fagot",
  trumpet: "Trompetă",
  horn: "Corn",
  "french horn": "Corn",
  trombone: "Trombon",
  tuba: "Tubă",
  piano: "Pian",
  organ: "Orgă",
  guitar: "Chitară",
  voice: "Voce (cor)",
  choir: "Voce (cor)",
  "voice aahs": "Voce (cor)",
}

const DYNAMIC_SET = new Set<string>(DYNAMICS)

// --- mici ajutoare DOM (copii DIRECȚI, ca structura imbricată să nu se amestece) ---

function kids(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter((c) => c.tagName === tag)
}
function kid(el: Element, tag: string): Element | null {
  return kids(el, tag)[0] ?? null
}
function kidText(el: Element, tag: string): string | null {
  return kid(el, tag)?.textContent?.trim() ?? null
}

function clefFromSign(sign: string | null): Clef {
  if (sign === "F") return "bass"
  if (sign === "C") return "alto"
  return "treble"
}

function instrumentFromName(name: string): string {
  const alias = INSTRUMENT_ALIASES[name.trim().toLowerCase()]
  return alias ?? name.trim()
}

/** Starea de legato în construcție pentru un portativ (number → id-ul notei de start) */
type SlurState = Map<string, string>
/** Starea de tuplet deschis pentru un portativ */
type TupletState = { id: string; count: number } | null

export function parseMusicXML(xml: string): ImportedScore {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  if (doc.querySelector("parsererror")) {
    throw new Error("Fișierul nu e un XML valid.")
  }
  const root = doc.querySelector("score-partwise")
  if (!root) {
    throw new Error("Fișier MusicXML nesuportat (se acceptă doar score-partwise).")
  }

  // --- meta: titlu, compozitor ---
  const title =
    doc.querySelector("work > work-title")?.textContent?.trim() ||
    doc.querySelector("movement-title")?.textContent?.trim() ||
    ""
  const composer =
    doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim() || ""

  // --- tempo: primul metronom (♩ = X), altfel primul <sound tempo=> ---
  let tempo = 120
  let tempoBeat: Duration = "quarter"
  let tempoBeatDotted = false
  const metronome = doc.querySelector("metronome")
  if (metronome) {
    const perMinute = Number(kidText(metronome, "per-minute"))
    if (Number.isFinite(perMinute) && perMinute > 0) tempo = Math.round(perMinute)
    const beatUnit = kidText(metronome, "beat-unit")
    if (beatUnit && TYPE_TO_DURATION[beatUnit]) tempoBeat = TYPE_TO_DURATION[beatUnit]
    tempoBeatDotted = !!kid(metronome, "beat-unit-dot")
  } else {
    const sound = doc.querySelector("sound[tempo]")
    const t = Number(sound?.getAttribute("tempo"))
    if (Number.isFinite(t) && t > 0) tempo = Math.round(t)
  }

  // --- numele instrumentelor, pe id de partidă (din part-list) ---
  const partNames = new Map<string, string>()
  doc.querySelectorAll("part-list > score-part").forEach((sp) => {
    const id = sp.getAttribute("id")
    if (id) partNames.set(id, kidText(sp, "part-name") ?? "Instrument")
  })

  let timeSignature: TimeSignature | null = null
  const staves: Staff[] = []

  doc.querySelectorAll("part").forEach((partEl) => {
    const partId = partEl.getAttribute("id") ?? ""
    const instrument = instrumentFromName(partNames.get(partId) ?? "Instrument")
    const measures = kids(partEl, "measure")

    // cheile și armura inițiale: din primele <attributes> cu astfel de elemente
    let keySignature: KeySignature = "C"
    const clefByStaff = new Map<number, Clef>()
    for (const measure of measures) {
      const attr = kid(measure, "attributes")
      if (!attr) continue
      const fifthsText = attr.querySelector("key > fifths")?.textContent
      if (fifthsText !== null && fifthsText !== undefined) {
        const fifths = Number(fifthsText)
        if (FIFTHS_TO_KEY.has(fifths)) keySignature = FIFTHS_TO_KEY.get(fifths)!
      }
      kids(attr, "clef").forEach((clefEl) => {
        const num = Number(clefEl.getAttribute("number") ?? "1")
        clefByStaff.set(num, clefFromSign(kidText(clefEl, "sign")))
      })
      // măsura globală: prima întâlnită
      const time = kid(attr, "time")
      if (time && !timeSignature) {
        const num = Number(kidText(time, "beats"))
        const den = Number(kidText(time, "beat-type"))
        if (num > 0 && den > 0) timeSignature = { numerator: num, denominator: den }
      }
      if (clefByStaff.size > 0) break
    }

    // câte portative are partida (pian = 2): după numerele de cheie
    const staffCount = Math.max(1, clefByStaff.size)
    const groupId = staffCount > 1 ? nextGroupId() : undefined
    const partStaves: Staff[] = []
    for (let s = 1; s <= staffCount; s++) {
      partStaves.push({
        id: nextStaffId(),
        instrument,
        clef: clefByStaff.get(s) ?? "treble",
        keySignature,
        groupId,
        notes: [],
        slurs: [],
      })
    }

    // stare per portativ în timpul parcurgerii
    const slurStates: SlurState[] = partStaves.map(() => new Map())
    const tupletStates: TupletState[] = partStaves.map(() => null)
    const pendingDynamic: (Dynamic | undefined)[] = partStaves.map(() => undefined)
    const firstVoice: (string | null)[] = partStaves.map(() => null)
    let divisions = 1

    for (const measure of measures) {
      for (const node of Array.from(measure.children)) {
        if (node.tagName === "attributes") {
          const div = Number(kidText(node, "divisions"))
          if (Number.isFinite(div) && div > 0) divisions = div
          continue
        }

        if (node.tagName === "direction") {
          // nuanța se aplică următoarei note din portativul direcției
          const dynEl = node.querySelector("direction-type > dynamics")
          const staffNum = Number(kidText(node, "staff") ?? "1")
          const idx = Math.min(Math.max(staffNum, 1), partStaves.length) - 1
          if (dynEl) {
            const tag = dynEl.firstElementChild?.tagName
            if (tag && DYNAMIC_SET.has(tag)) pendingDynamic[idx] = tag as Dynamic
          }
          continue
        }

        if (node.tagName !== "note") continue
        const noteEl = node
        // notele de podoabă (apogiaturi/cue) n-au durată proprie — le sărim, ca
        // să nu strice împărțirea pe timpi
        if (kid(noteEl, "grace") || kid(noteEl, "cue")) continue

        const staffNum = Number(kidText(noteEl, "staff") ?? "1")
        const idx = Math.min(Math.max(staffNum, 1), partStaves.length) - 1
        const staff = partStaves[idx]

        // o singură voce per portativ: ignorăm vocile secundare
        const voice = kidText(noteEl, "voice") ?? "1"
        if (firstVoice[idx] === null) firstVoice[idx] = voice
        else if (firstVoice[idx] !== voice) continue

        const isChord = !!kid(noteEl, "chord")
        const restEl = kid(noteEl, "rest")
        const pitchEl = kid(noteEl, "pitch")

        // --- acord: adăugăm înălțimea la ultima notă a portativului ---
        if (isChord && pitchEl) {
          const last = staff.notes[staff.notes.length - 1]
          if (last && last.type === "note") {
            last.pitches = [...last.pitches, pitchFromEl(noteEl, pitchEl)].sort(
              (a, b) => pitchIndex(a) - pitchIndex(b),
            )
          }
          continue
        }

        const typeText = kidText(noteEl, "type")
        const dotted = kids(noteEl, "dot").length > 0

        // --- pauză de măsură întreagă (fără <type>): descompunem în pauze ---
        if (restEl && !typeText) {
          const durDivs = Number(kidText(noteEl, "duration") ?? "0")
          const beats = divisions > 0 ? durDivs / divisions : 0
          for (const piece of decompose(beats)) {
            staff.notes.push({ id: nextId(), type: "rest", pitches: [DISPLAY_REST], duration: piece.duration, dotted: piece.dotted })
          }
          continue
        }

        const duration = (typeText && TYPE_TO_DURATION[typeText]) || "quarter"

        // --- tuplet (triolet): din <time-modification> + <tuplet start/stop> ---
        const timeMod = kid(noteEl, "time-modification")
        const notations = kid(noteEl, "notations")
        let tuplet: number | undefined
        let tupletId: string | undefined
        if (timeMod) {
          const actual = Number(kidText(timeMod, "actual-notes") ?? "0")
          const tupletMark = notations ? kids(notations, "tuplet")[0] : null
          const markType = tupletMark?.getAttribute("type")
          if (markType === "start" || tupletStates[idx] === null) {
            tupletStates[idx] = { id: nextTupletGroupId(), count: actual > 0 ? actual : 3 }
          }
          const open = tupletStates[idx]
          if (open) {
            tuplet = open.count
            tupletId = open.id
          }
          if (markType === "stop") tupletStates[idx] = null
        } else {
          tupletStates[idx] = null
        }

        const entry: NoteEntry = {
          id: nextId(),
          type: restEl ? "rest" : "note",
          pitches: restEl || !pitchEl ? [DISPLAY_REST] : [pitchFromEl(noteEl, pitchEl)],
          duration,
          dotted: dotted || undefined,
          tuplet,
          tupletId,
        }

        if (entry.type === "note") {
          // nuanța în vigoare (din direcția precedentă)
          if (pendingDynamic[idx]) {
            entry.dynamic = pendingDynamic[idx]
            pendingDynamic[idx] = undefined
          }
          // articulații + legato din <notations>
          if (notations) {
            const articEl = kid(notations, "articulations")
            if (articEl) {
              const arts = Array.from(articEl.children)
                .map((c) => ARTICULATION_FROM_XML[c.tagName])
                .filter((a): a is Articulation => !!a)
              if (arts.length > 0) entry.articulations = arts
            }
            kids(notations, "slur").forEach((slurEl) => {
              const number = slurEl.getAttribute("number") ?? "1"
              const type = slurEl.getAttribute("type")
              if (type === "start") {
                slurStates[idx].set(number, entry.id)
              } else if (type === "stop") {
                const fromId = slurStates[idx].get(number)
                if (fromId) {
                  staff.slurs.push({ fromId, toId: entry.id })
                  slurStates[idx].delete(number)
                }
              }
            })
          }
          // versuri (prima strofă)
          const lyricText = noteEl.querySelector("lyric > text")?.textContent?.trim()
          if (lyricText) entry.lyric = lyricText
        }

        staff.notes.push(entry)
      }
    }

    staves.push(...partStaves)
  })

  if (staves.length === 0) {
    throw new Error("Fișierul nu conține portative.")
  }

  return {
    staves,
    timeSignature: timeSignature ?? { numerator: 4, denominator: 4 },
    meta: { title, composer, tempo, tempoBeat, tempoBeatDotted, tempoText: "" },
  }
}

/** Poziția implicită de afișare a unei pauze (înlocuită la randare cu linia din mijloc) */
const DISPLAY_REST: Pitch = { step: "B", octave: 4 }

/** Înălțimea dintr-un element <note>: step + octave (+ alterația desenată explicit) */
function pitchFromEl(noteEl: Element, pitchEl: Element): Pitch {
  const step = (kidText(pitchEl, "step") ?? "C") as Step
  const octave = Number(kidText(pitchEl, "octave") ?? "4")
  const accidentalText = kidText(noteEl, "accidental")
  const accidental = accidentalText ? ACCIDENTAL_FROM_XML[accidentalText] : undefined
  return accidental ? { step, octave, accidental } : { step, octave }
}

// id-uri de grup de tuplet pentru notele importate (independente de contorul din
// reducer; `loadScore` re-sincronizează contoarele după import)
let importTupletCounter = 0
function nextTupletGroupId(): string {
  importTupletCounter += 1
  return `tuplet-imp-${importTupletCounter}`
}
