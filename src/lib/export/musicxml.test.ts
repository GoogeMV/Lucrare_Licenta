import { describe, it, expect } from "vitest"
import { scoreToMusicXML } from "@/lib/export/musicxml"
import type { Staff } from "@/types/score"

const staff: Staff = {
  id: "staff-1",
  instrument: "Vioară",
  clef: "treble",
  keySignature: "C",
  notes: [
    { id: "n1", type: "note", pitches: [{ step: "G", octave: 4 }], duration: "quarter" },
    { id: "n2", type: "rest", pitches: [{ step: "B", octave: 4 }], duration: "quarter" },
  ],
  slurs: [],
}

describe("scoreToMusicXML", () => {
  const xml = scoreToMusicXML([staff], { numerator: 4, denominator: 4 }, { title: "Test" })

  it("produce un document score-partwise valid", () => {
    expect(xml).toContain("<score-partwise")
    expect(xml).toContain("<work-title>Test</work-title>")
  })
  it("include instrumentul cu programul MIDI corect", () => {
    expect(xml).toContain("<part-name>Vioară</part-name>")
    expect(xml).toContain("<midi-program>41</midi-program>") // Vioară = GM 41
  })
  it("scrie nota (înălțime + tip) și pauza", () => {
    expect(xml).toContain("<step>G</step>")
    expect(xml).toContain("<octave>4</octave>")
    expect(xml).toContain("<rest/>")
  })
  it("folosește 12 diviziuni per pătrime (pentru triolete)", () => {
    expect(xml).toContain("<divisions>12</divisions>")
  })
})
