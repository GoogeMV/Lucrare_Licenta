import { describe, it, expect } from "vitest"
import { scoreReducer, initialScoreState, historyReducer, initialHistoryState } from "@/state/scoreReducer"

const firstId = initialScoreState.staves[0].notes[0].id // prima notă = Sol4

describe("transposeSelected", () => {
  it("urcă înălțimea notei selectate cu o treaptă (Sol4 → La4)", () => {
    let s = scoreReducer(initialScoreState, { type: "selectNote", id: firstId })
    s = scoreReducer(s, { type: "transposeSelected", direction: "up" })
    expect(s.staves[0].notes[0].pitches[0]).toEqual({ step: "A", octave: 4 })
  })
})

describe("makeTriplet", () => {
  it("înlocuiește nota cu 3 intrări egale de triolet", () => {
    const before = initialScoreState.staves[0].notes.length
    let s = scoreReducer(initialScoreState, { type: "selectNote", id: firstId })
    s = scoreReducer(s, { type: "makeTriplet" })
    expect(s.staves[0].notes.length).toBe(before + 2)
    const trio = s.staves[0].notes.slice(0, 3)
    expect(trio.every((n) => n.tuplet === 3)).toBe(true)
    expect(new Set(trio.map((n) => n.tupletId)).size).toBe(1) // același grup
    expect(trio.every((n) => n.duration === "eighth")).toBe(true) // pătrime → optimi
  })
})

describe("toggleRest", () => {
  it("comută nota în pauză și înapoi", () => {
    let s = scoreReducer(initialScoreState, { type: "selectNote", id: firstId })
    s = scoreReducer(s, { type: "toggleRest" })
    expect(s.staves[0].notes[0].type).toBe("rest")
    s = scoreReducer(s, { type: "toggleRest" })
    expect(s.staves[0].notes[0].type).toBe("note")
  })
})

describe("historyReducer (undo/redo)", () => {
  it("face snapshot doar la schimbări de conținut și revine la undo", () => {
    // selecția nu schimbă conținutul → fără snapshot
    const h1 = historyReducer(initialHistoryState, { type: "selectNote", id: firstId })
    expect(h1.past).toHaveLength(0)

    // transpunerea schimbă conținutul → snapshot
    const h2 = historyReducer(h1, { type: "transposeSelected", direction: "up" })
    expect(h2.past).toHaveLength(1)
    expect(h2.present.staves[0].notes[0].pitches[0]).toEqual({ step: "A", octave: 4 })

    // undo readuce Sol4
    const h3 = historyReducer(h2, { type: "undo" })
    expect(h3.present.staves[0].notes[0].pitches[0]).toEqual({ step: "G", octave: 4 })

    // redo reaplică
    const h4 = historyReducer(h3, { type: "redo" })
    expect(h4.present.staves[0].notes[0].pitches[0]).toEqual({ step: "A", octave: 4 })
  })
})
