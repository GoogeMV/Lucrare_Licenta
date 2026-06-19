import { describe, it, expect } from "vitest"
import {
  supportsTab,
  stringCountForInstrument,
  openStringPitch,
  tabPosition,
  pitchForStringFret,
} from "@/lib/notation/tab"

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
