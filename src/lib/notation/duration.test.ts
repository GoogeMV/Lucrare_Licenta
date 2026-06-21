import { describe, it, expect } from "vitest"
import {
  DURATION_BEATS,
  entryBeats,
  tupletNormal,
  smallerDuration,
  vexflowDurationCode,
  playbackQuarterBpm,
} from "@/lib/notation/duration"

describe("entryBeats", () => {
  it("durate de bază în pătrimi", () => {
    expect(entryBeats({ duration: "whole" })).toBe(4)
    expect(entryBeats({ duration: "quarter" })).toBe(1)
    expect(entryBeats({ duration: "sixteenth" })).toBe(0.25)
  })
  it("punctul de prelungire adaugă 50%", () => {
    expect(entryBeats({ duration: "quarter", dotted: true })).toBe(1.5)
    expect(entryBeats({ duration: "half", dotted: true })).toBe(3)
  })
  it("trioletul scalează cu normal/count", () => {
    expect(entryBeats({ duration: "eighth", tuplet: 3 })).toBeCloseTo(1 / 3, 6)
    expect(entryBeats({ duration: "quarter", tuplet: 3 })).toBeCloseTo(2 / 3, 6)
  })
  it("trei optimi de triolet fac exact un timp", () => {
    const one = entryBeats({ duration: "eighth", tuplet: 3 }) * 3
    expect(one).toBeCloseTo(1, 6)
  })
})

describe("tupletNormal", () => {
  it("cel mai mare power-of-2 ≤ count", () => {
    expect(tupletNormal(3)).toBe(2)
    expect(tupletNormal(5)).toBe(4)
    expect(tupletNormal(6)).toBe(4)
    expect(tupletNormal(2)).toBe(2)
  })
})

describe("smallerDuration", () => {
  it("coboară o treaptă de durată", () => {
    expect(smallerDuration("whole")).toBe("half")
    expect(smallerDuration("quarter")).toBe("eighth")
  })
  it("șaisprezecimea nu mai are una mai mică", () => {
    expect(smallerDuration("sixteenth")).toBeNull()
  })
})

describe("vexflowDurationCode", () => {
  it("codează durata; pauzele primesc sufixul r", () => {
    expect(vexflowDurationCode("quarter", false)).toBe("q")
    expect(vexflowDurationCode("quarter", true)).toBe("qr")
    expect(vexflowDurationCode("sixteenth", false)).toBe("16")
  })
})

describe("playbackQuarterBpm", () => {
  it("♩=120 la 100% = 120", () => {
    expect(playbackQuarterBpm(120, "quarter", false, 100)).toBe(120)
  })
  it("♪=120 = 60 pătrimi/min", () => {
    expect(playbackQuarterBpm(120, "eighth", false, 100)).toBe(60)
  })
  it("punctul și viteza se aplică", () => {
    expect(playbackQuarterBpm(120, "quarter", true, 100)).toBe(180)
    expect(playbackQuarterBpm(120, "quarter", false, 50)).toBe(60)
  })
})

describe("DURATION_BEATS", () => {
  it("coerent cu entryBeats", () => {
    expect(DURATION_BEATS.half).toBe(2)
  })
})
