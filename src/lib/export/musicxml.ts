import type { Accidental, Articulation, Clef, Duration, Staff, TimeSignature } from "@/types/score"
import { DURATION_BEATS, entryBeats, tupletNormal } from "@/lib/notation/duration"
import { DYNAMIC_MUSICXML_TAGS } from "@/lib/notation/dynamics"
import { keyAccidentalMap, keyFifths } from "@/lib/notation/keySignature"
import { measureQuarters } from "@/lib/notation/timeSignature"
import { splitIntoMeasures, type MeasureFragment } from "@/lib/notation/measure"

/**
 * Export MusicXML (score-partwise 3.1) — formatul standard de schimb pentru
 * notație, deschis de MuseScore, Finale, Sibelius etc.
 *
 * Corespondența cu modelul nostru:
 *  - fiecare `Staff` devine un `<part>` propriu (pianul apare ca două partide
 *    separate, nu ca un sistem cu acoladă — simplificare asumată);
 *  - `<alter>` reflectă înălțimea care SUNĂ (alterația explicită sau cea din
 *    armură), iar `<accidental>` apare doar pentru alterațiile explicite —
 *    aceeași logică folosită la redarea audio;
 *  - măsurile sunt împărțite identic cu randarea (lib/notation/measure).
 */

// unități de durată per pătrime: 12 => divizibil cu 4 (șaisprezecime = 3) ȘI cu 3
// (optime de triolet = 4), deci toate duratele noastre, inclusiv trioletele, ies întregi
const DIVISIONS = 12

const TYPE_NAMES: Record<Duration, string> = {
  whole: "whole",
  half: "half",
  quarter: "quarter",
  eighth: "eighth",
  sixteenth: "16th",
}

const CLEF_SIGNS: Record<Clef, { sign: string; line: number }> = {
  treble: { sign: "G", line: 2 },
  bass: { sign: "F", line: 4 },
  alto: { sign: "C", line: 3 },
}

const ALTER_VALUES: Record<Accidental, number> = { sharp: 1, flat: -1, natural: 0 }

const ACCIDENTAL_NAMES: Record<Accidental, string> = {
  sharp: "sharp",
  flat: "flat",
  natural: "natural",
}

const ARTICULATION_TAGS: Record<Articulation, string> = {
  staccato: "staccato",
  accent: "accent",
  tenuto: "tenuto",
  marcato: "strong-accent",
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function scoreToMusicXML(
  staves: Staff[],
  timeSignature: TimeSignature,
  meta?: { title?: string; composer?: string; tempo?: number; tempoBeat?: Duration; tempoBeatDotted?: boolean },
): string {
  const beatsPerMeasure = measureQuarters(timeSignature)
  const measureDivisions = Math.round(beatsPerMeasure * DIVISIONS)
  const title = meta?.title?.trim() || "Partitură fără titlu"
  const composer = meta?.composer?.trim()
  const tempo = meta?.tempo ?? 120
  const tempoBeat: Duration = meta?.tempoBeat ?? "quarter"
  const tempoBeatDotted = meta?.tempoBeatDotted ?? false

  // toate părțile trebuie să aibă același număr de măsuri (cele scurte se
  // completează cu pauze de măsură întreagă), altfel partitura se dezaliniază
  const totalMeasures = staves.reduce(
    (max, staff) => Math.max(max, splitIntoMeasures(staff.notes, beatsPerMeasure).length),
    1,
  )

  const partList = staves
    .map(
      (staff, i) =>
        `    <score-part id="P${i + 1}"><part-name>${escapeXml(staff.instrument)}</part-name></score-part>`,
    )
    .join("\n")

  const parts = staves
    .map((staff, i) =>
      partToXml(staff, i + 1, timeSignature, measureDivisions, totalMeasures, tempo, tempoBeat, tempoBeatDotted),
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <identification>
${composer ? `    <creator type="composer">${escapeXml(composer)}</creator>\n` : ""}    <encoding><software>NotationSoft</software></encoding>
  </identification>
  <part-list>
${partList}
  </part-list>
${parts}
</score-partwise>
`
}

function partToXml(
  staff: Staff,
  partNumber: number,
  timeSignature: TimeSignature,
  measureDivisions: number,
  totalMeasures: number,
  tempo: number,
  tempoBeat: Duration,
  tempoBeatDotted: boolean,
): string {
  const beatsPerMeasure = measureQuarters(timeSignature)
  const measures = splitIntoMeasures(staff.notes, beatsPerMeasure)
  while (measures.length < totalMeasures) measures.push([])
  const keyMap = keyAccidentalMap(staff.keySignature)
  const clef = CLEF_SIGNS[staff.clef]

  // legato: numerotăm legăturile (1-6, ciclic — convenția MusicXML) și marcăm
  // nota de început (start) și cea de final (stop)
  const slurStarts = new Map<string, number>()
  const slurStops = new Map<string, number>()
  staff.slurs.forEach((slur, i) => {
    const number = (i % 6) + 1
    slurStarts.set(slur.fromId, number)
    slurStops.set(slur.toId, number)
  })

  const measuresXml = measures
    .map((fragments, measureIndex) => {
      const lines: string[] = [`    <measure number="${measureIndex + 1}">`]

      // atributele (diviziuni, armură, măsură, cheie) doar pe prima măsură
      if (measureIndex === 0) {
        lines.push(
          "      <attributes>",
          `        <divisions>${DIVISIONS}</divisions>`,
          `        <key><fifths>${keyFifths(staff.keySignature)}</fifths></key>`,
          `        <time><beats>${timeSignature.numerator}</beats><beat-type>${timeSignature.denominator}</beat-type></time>`,
          `        <clef><sign>${clef.sign}</sign><line>${clef.line}</line></clef>`,
          "      </attributes>",
        )
        // indicația de tempo (♩ = X) — o singură dată, pe prima parte
        if (partNumber === 1) {
          lines.push(
            '      <direction placement="above">',
            "        <direction-type>",
            `          <metronome><beat-unit>${TYPE_NAMES[tempoBeat]}</beat-unit>${tempoBeatDotted ? "<beat-unit-dot/>" : ""}<per-minute>${tempo}</per-minute></metronome>`,
            "        </direction-type>",
            // sound@tempo e mereu în pătrimi/min (convenția MusicXML)
            `        <sound tempo="${Math.round(tempo * DURATION_BEATS[tempoBeat] * (tempoBeatDotted ? 1.5 : 1))}"/>`,
            "      </direction>",
          )
        }
      }

      if (fragments.length === 0) {
        // măsură goală — pauză de măsură întreagă, ca partida să rămână validă
        lines.push(`      <note><rest measure="yes"/><duration>${measureDivisions}</duration></note>`)
      } else {
        fragments.forEach((frag, k) => {
          const entry = staff.notes[frag.noteIndex]
          // nuanța se exportă ca <direction> o singură dată, înaintea primului
          // fragment al notei (nu pe continuările legate peste bară)
          if (entry.dynamic && !frag.tieStop) {
            lines.push(
              '      <direction placement="below">',
              "        <direction-type>",
              `          <dynamics><${DYNAMIC_MUSICXML_TAGS[entry.dynamic]}/></dynamics>`,
              "        </direction-type>",
              "      </direction>",
            )
          }
          // începutul/sfârșitul grupului de tuplet (trioletele nu trec peste bară,
          // deci marginile se află comparând cu fragmentele vecine din măsură)
          const tupletStart = !!frag.tupletId && fragments[k - 1]?.tupletId !== frag.tupletId
          const tupletStop = !!frag.tupletId && fragments[k + 1]?.tupletId !== frag.tupletId
          lines.push(noteToXml(entry, frag, keyMap, slurStarts, slurStops, tupletStart, tupletStop))
        })
      }

      lines.push("    </measure>")
      return lines.join("\n")
    })
    .join("\n")

  return `  <part id="P${partNumber}">\n${measuresXml}\n  </part>`
}

function noteToXml(
  entry: Staff["notes"][number],
  frag: MeasureFragment,
  keyMap: ReturnType<typeof keyAccidentalMap>,
  slurStarts: Map<string, number>,
  slurStops: Map<string, number>,
  tupletStart = false,
  tupletStop = false,
): string {
  // durata/valoarea vin din FRAGMENT (o notă spartă peste bară are fragmente cu
  // valori diferite, legate prin tie); alterațiile/legato/articulațiile sunt
  // proprietăți ale notei și apar doar pe primul fragment
  const duration = Math.round(
    entryBeats({ duration: frag.duration, dotted: frag.dotted, tuplet: frag.tuplet }) * DIVISIONS,
  )
  const type = TYPE_NAMES[frag.duration]
  const isFirst = !frag.tieStop
  // raportul de tuplet (3:2 pentru triolet) — folosit la <time-modification>
  const timeMod = frag.tuplet
    ? [
        "        <time-modification>",
        `          <actual-notes>${frag.tuplet}</actual-notes>`,
        `          <normal-notes>${tupletNormal(frag.tuplet)}</normal-notes>`,
        "        </time-modification>",
      ]
    : []
  // notațiile de tuplet (bracket + „3") la marginile grupului
  const tupletNotations: string[] = []
  if (tupletStart) tupletNotations.push('          <tuplet type="start" bracket="yes" number="1"/>')
  if (tupletStop) tupletNotations.push('          <tuplet type="stop" number="1"/>')

  if (entry.type === "rest") {
    const lines = ["      <note>", "        <rest/>"]
    lines.push(`        <duration>${duration}</duration>`, `        <type>${type}</type>`)
    if (frag.dotted) lines.push("        <dot/>")
    lines.push(...timeMod)
    if (tupletNotations.length > 0) {
      lines.push("        <notations>", ...tupletNotations, "        </notations>")
    }
    lines.push("      </note>")
    return lines.join("\n")
  }

  // un acord = o secvență de <note>: prima normală, următoarele marcate <chord/>
  // (convenția MusicXML); notations (legato/articulații) doar pe prima
  return entry.pitches
    .map((pitch, pitchIdx) => {
      const lines: string[] = ["      <note>"]
      if (pitchIdx > 0) lines.push("        <chord/>")

      // alterația care sună: explicită sau moștenită din armură (ca la redare)
      const sounding = pitch.accidental ?? keyMap[pitch.step]
      const alter = sounding ? ALTER_VALUES[sounding] : 0
      lines.push(
        "        <pitch>",
        `          <step>${pitch.step}</step>`,
        ...(alter !== 0 ? [`          <alter>${alter}</alter>`] : []),
        `          <octave>${pitch.octave}</octave>`,
        "        </pitch>",
      )

      lines.push(`        <duration>${duration}</duration>`)
      // ligatura care SUNĂ (tie) — pe fiecare notă a acordului
      if (frag.tieStop) lines.push('        <tie type="stop"/>')
      if (frag.tieStart) lines.push('        <tie type="start"/>')
      lines.push(`        <type>${type}</type>`)
      if (frag.dotted) lines.push("        <dot/>")

      // alterația desenată explicit (doar pe primul fragment; continuările legate
      // nu repetă alterația)
      if (isFirst && pitch.accidental) {
        lines.push(`        <accidental>${ACCIDENTAL_NAMES[pitch.accidental]}</accidental>`)
      }

      // raportul de tuplet — pe fiecare notă (inclusiv membrii acordului)
      lines.push(...timeMod)

      if (pitchIdx === 0) {
        const articulations = isFirst ? entry.articulations ?? [] : []
        const slurStart = isFirst ? slurStarts.get(entry.id) : undefined
        const slurStop = isFirst ? slurStops.get(entry.id) : undefined
        const hasNotations =
          articulations.length > 0 ||
          slurStart !== undefined ||
          slurStop !== undefined ||
          frag.tieStart ||
          frag.tieStop ||
          tupletNotations.length > 0
        if (hasNotations) {
          lines.push("        <notations>")
          // ligatura VIZUALĂ (tied) — perechea grafică a <tie>
          if (frag.tieStop) lines.push('          <tied type="stop"/>')
          if (frag.tieStart) lines.push('          <tied type="start"/>')
          // o notă poate fi simultan finalul unei legături și începutul alteia
          if (slurStop !== undefined) lines.push(`          <slur type="stop" number="${slurStop}"/>`)
          if (slurStart !== undefined) lines.push(`          <slur type="start" number="${slurStart}"/>`)
          if (articulations.length > 0) {
            lines.push(
              "          <articulations>",
              ...articulations.map((a) => `            <${ARTICULATION_TAGS[a]}/>`),
              "          </articulations>",
            )
          }
          lines.push(...tupletNotations)
          lines.push("        </notations>")
        }

        // versuri (o singură strofă): silaba se atașează notei (prima a acordului),
        // doar pe primul fragment. Păstrăm silabele independente (syllabic=single).
        if (isFirst && entry.lyric) {
          lines.push(
            '        <lyric number="1">',
            "          <syllabic>single</syllabic>",
            `          <text>${escapeXml(entry.lyric)}</text>`,
            "        </lyric>",
          )
        }
      }

      lines.push("      </note>")
      return lines.join("\n")
    })
    .join("\n")
}
