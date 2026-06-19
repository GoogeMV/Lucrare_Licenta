import { describe, it, expect } from "vitest"
import {
  pitchIndex,
  stepUp,
  stepDown,
  pitchSemitone,
  semitoneToPitch,
  nearestPitchWithStep,
} from "@/lib/notation/pitch"

describe("pitchIndex", () => {
  it("crește cu înălțimea, octava cântărește 7 trepte", () => {
    expect(pitchIndex({ step: "C", octave: 4 })).toBe(28)
    expect(pitchIndex({ step: "D", octave: 4 })).toBe(29)
    expect(pitchIndex({ step: "C", octave: 5 })).toBeGreaterThan(pitchIndex({ step: "B", octave: 4 }))
  })
})

describe("stepUp / stepDown", () => {
  it("trec corect peste granița de octavă", () => {
    expect(stepUp({ step: "B", octave: 4 })).toEqual({ step: "C", octave: 5 })
    expect(stepDown({ step: "C", octave: 4 })).toEqual({ step: "B", octave: 3 })
  })
  it("sunt inverse în interiorul octavei", () => {
    expect(stepDown(stepUp({ step: "D", octave: 4 }))).toEqual({ step: "D", octave: 4 })
  })
})

describe("pitchSemitone / semitoneToPitch", () => {
  it("semitonul cromatic", () => {
    expect(pitchSemitone({ step: "C", octave: 4 })).toBe(48)
    expect(pitchSemitone({ step: "C", octave: 4, accidental: "sharp" })).toBe(49)
  })
  it("round-trip prin semiton (cu diezi)", () => {
    expect(semitoneToPitch(48)).toEqual({ step: "C", octave: 4 })
    expect(semitoneToPitch(49)).toEqual({ step: "C", octave: 4, accidental: "sharp" })
    for (let s = 36; s <= 72; s++) {
      expect(pitchSemitone(semitoneToPitch(s))).toBe(s)
    }
  })
})

describe("nearestPitchWithStep", () => {
  it("alege octava cea mai apropiată (Sol4 → C dă Do5)", () => {
    expect(nearestPitchWithStep({ step: "G", octave: 4 }, "C")).toEqual({ step: "C", octave: 5 })
  })
})
