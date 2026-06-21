import { describe, it, expect } from "vitest"
import {
  supportsTab,
  stringCountForInstrument,
  openStringPitch,
  tabPosition,
  tabPositionsForChord,
  pitchForStringFret,
} from "@/lib/notation/tab"
import type { Pitch } from "@/types/score"

describe("supportsTab", () => {
  it("doar chitarele suportă TAB", () => {
    expect(supportsTab("Chitară")).toBe(true)
    expect(supportsTab("Chitară bas")).toBe(true)
    expect(supportsTab("Vioară")).toBe(false)
  })
})

describe("stringCountForInstrument", () => {
  it("chitara are 6 corzi, basul 4", () => {
    expect(stringCountForInstrument("Chitară")).toBe(6)
    expect(stringCountForInstrument("Chitară bas")).toBe(4)
  })
})

describe("openStringPitch", () => {
  it("acordajul standard EADGBE (str 1 = Mi4, str 6 = Mi2)", () => {
    expect(openStringPitch("Chitară", 1)).toEqual({ step: "E", octave: 4 })
    expect(openStringPitch("Chitară", 6)).toEqual({ step: "E", octave: 2 })
  })
})

describe("tabPosition / pitchForStringFret", () => {
  it("coarda liberă 1 = fret 0", () => {
    expect(tabPosition({ step: "E", octave: 4 }, "Chitară")).toEqual({ str: 1, fret: 0 })
  })
  it("fret-ul ales pe o coardă dă înălțimea corectă, dus-întors", () => {
    const pitch = pitchForStringFret("Chitară", 2, 3) // coarda 2 (Si3) + 3 = Re4
    expect(pitch).toMatchObject({ step: "D", octave: 4, string: 2 })
    expect(tabPosition(pitch, "Chitară")).toEqual({ str: 2, fret: 3 })
  })
})

describe("tabPositionsForChord", () => {
  it("un acord primește corzi DISTINCTE (fără suprapunere)", () => {
    // Do major: Do4, Mi4, Sol4 — fără mapare per-notă ar coincide pe coarda 1
    const chord: Pitch[] = [
      { step: "C", octave: 4 },
      { step: "E", octave: 4 },
      { step: "G", octave: 4 },
    ]
    const pos = tabPositionsForChord(chord, "Chitară")
    const strings = pos.map((p) => p.str)
    expect(new Set(strings).size).toBe(3) // toate distincte
    pos.forEach((p) => expect(p.fret).toBeGreaterThanOrEqual(0))
  })

  it("o singură notă e identică cu tabPosition", () => {
    const p: Pitch = { step: "E", octave: 4 }
    expect(tabPositionsForChord([p], "Chitară")).toEqual([tabPosition(p, "Chitară")])
  })

  it("onorează coarda aleasă explicit", () => {
    const chord: Pitch[] = [
      { step: "E", octave: 4 }, // implicit ar fi coarda 1
      { step: "B", octave: 3, string: 2 }, // forțat pe coarda 2
    ]
    const pos = tabPositionsForChord(chord, "Chitară")
    expect(pos[1]).toEqual({ str: 2, fret: 0 })
    expect(pos[0].str).not.toBe(2)
  })
})
