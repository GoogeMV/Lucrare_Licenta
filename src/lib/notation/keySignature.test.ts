import { describe, it, expect } from "vitest"
import { keyAccidentalMap, keyAccidentalCount, keyFifths } from "@/lib/notation/keySignature"

describe("keyFifths", () => {
  it("poziția pe cercul cvintelor (diezi +, bemoli −)", () => {
    expect(keyFifths("C")).toBe(0)
    expect(keyFifths("G")).toBe(1)
    expect(keyFifths("F#")).toBe(6)
    expect(keyFifths("F")).toBe(-1)
    expect(keyFifths("Bb")).toBe(-2)
  })
})

describe("keyAccidentalCount", () => {
  it("numărul de alterații", () => {
    expect(keyAccidentalCount("C")).toBe(0)
    expect(keyAccidentalCount("D")).toBe(2)
    expect(keyAccidentalCount("Eb")).toBe(3)
  })
})

describe("keyAccidentalMap", () => {
  it("Sol major: Fa devine diez", () => {
    expect(keyAccidentalMap("G")).toEqual({ F: "sharp" })
  })
  it("Re major: Fa și Do diez", () => {
    expect(keyAccidentalMap("D")).toEqual({ F: "sharp", C: "sharp" })
  })
  it("Fa major: Si devine bemol", () => {
    expect(keyAccidentalMap("F")).toEqual({ B: "flat" })
  })
  it("Do major: fără alterații", () => {
    expect(keyAccidentalMap("C")).toEqual({})
  })
})
