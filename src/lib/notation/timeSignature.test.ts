import { describe, it, expect } from "vitest"
import { measureQuarters, timeSignatureLabel, beatSeconds } from "@/lib/notation/timeSignature"

describe("measureQuarters", () => {
  it("durata unei măsuri în pătrimi", () => {
    expect(measureQuarters({ numerator: 4, denominator: 4 })).toBe(4)
    expect(measureQuarters({ numerator: 3, denominator: 4 })).toBe(3)
    expect(measureQuarters({ numerator: 6, denominator: 8 })).toBe(3)
    expect(measureQuarters({ numerator: 2, denominator: 2 })).toBe(4)
  })
})

describe("timeSignatureLabel", () => {
  it("eticheta text", () => {
    expect(timeSignatureLabel({ numerator: 4, denominator: 4 })).toBe("4/4")
    expect(timeSignatureLabel({ numerator: 6, denominator: 8 })).toBe("6/8")
  })
})

describe("beatSeconds", () => {
  it("durata unui timp la un tempo dat (pătrimi/min)", () => {
    expect(beatSeconds({ numerator: 4, denominator: 4 }, 120)).toBeCloseTo(0.5, 6)
    // în 6/8 un timp = optime → jumătate dintr-o pătrime
    expect(beatSeconds({ numerator: 6, denominator: 8 }, 120)).toBeCloseTo(0.25, 6)
  })
})
