import { describe, it, expect } from "vitest"
import { splitIntoMeasures, decompose } from "@/lib/notation/measure"
import type { NoteEntry } from "@/types/score"

const note = (duration: NoteEntry["duration"], extra: Partial<NoteEntry> = {}): NoteEntry => ({
  id: Math.random().toString(36).slice(2),
  type: "note",
  pitches: [{ step: "C", octave: 4 }],
  duration,
  ...extra,
})

describe("splitIntoMeasures", () => {
  it("notele care încap rămân un fragment, în aceeași măsură", () => {
    const measures = splitIntoMeasures([note("quarter"), note("quarter")], 4)
    expect(measures).toHaveLength(1)
    expect(measures[0]).toHaveLength(2)
    expect(measures[0][0]).toMatchObject({ duration: "quarter" })
    expect(measures[0][0].tieStart).toBeUndefined()
  })

  it("o notă care depășește bara se sparge în fragmente legate (tie)", () => {
    // half (2) apoi whole (4) în 4/4: whole umple restul m1 (2) + m2 (2)
    const measures = splitIntoMeasures([note("half"), note("whole")], 4)
    expect(measures).toHaveLength(2)
    // în m1: half-ul original + primul fragment al întregii (tieStart)
    const crossingStart = measures[0][measures[0].length - 1]
    const crossingStop = measures[1][0]
    expect(crossingStart.tieStart).toBe(true)
    expect(crossingStop.tieStop).toBe(true)
  })

  it("pauzele se sparg dar FĂRĂ tie", () => {
    const measures = splitIntoMeasures([note("half", { type: "rest" }), note("whole", { type: "rest" })], 4)
    const frag = measures[1][0]
    expect(frag.tieStop).toBeUndefined()
  })

  it("trioletul e ATOMIC — nu se descompune și nu se sparge", () => {
    const t = (id: string) => note("eighth", { tuplet: 3, tupletId: "t1", id })
    const measures = splitIntoMeasures([t("a"), t("b"), t("c")], 4)
    expect(measures).toHaveLength(1)
    expect(measures[0]).toHaveLength(3)
    for (const frag of measures[0]) {
      expect(frag.duration).toBe("eighth")
      expect(frag.tuplet).toBe(3)
      expect(frag.tieStart).toBeUndefined()
    }
  })
})

describe("decompose", () => {
  it("descompune numere de pătrimi în valori notabile (greedy)", () => {
    expect(decompose(4)).toEqual([{ duration: "whole", dotted: undefined }])
    expect(decompose(3)).toEqual([{ duration: "half", dotted: true }])
    expect(decompose(1.5)).toEqual([{ duration: "quarter", dotted: true }])
    expect(decompose(2.5)).toEqual([
      { duration: "half", dotted: undefined },
      { duration: "eighth", dotted: undefined },
    ])
    expect(decompose(0.25)).toEqual([{ duration: "sixteenth", dotted: undefined }])
  })
})
