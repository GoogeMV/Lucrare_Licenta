import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Square, RotateCcw } from "lucide-react"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { ScorePlayer } from "@/lib/audio/playback"
import { Metronome } from "@/lib/audio/metronome"

/**
 * Bară de jos: control playback (play/stop) și tempo (BPM). Redarea folosește
 * motorul audio Tone.js (`ScorePlayer`) și citește notele din starea partajată;
 * pe durata redării, nota curentă e evidențiată pe portativ prin selecție.
 * Metronomul urmează într-un pas viitor.
 */
export function TransportBar() {
  const { staves, activeStaffId, selectedStaffIds, timeSignature, dispatch } = useScoreEditor()
  const [isPlaying, setIsPlaying] = useState(false)
  const [tempo, setTempo] = useState(120)
  const [metronomeOn, setMetronomeOn] = useState(false)

  // un singur player și un singur metronom pe toată durata componentei
  const playerRef = useRef<ScorePlayer | null>(null)
  if (!playerRef.current) playerRef.current = new ScorePlayer()
  const metronomeRef = useRef<Metronome | null>(null)
  if (!metronomeRef.current) metronomeRef.current = new Metronome()

  // oprește redarea la demontarea componentei (evită sunet rămas în urmă)
  useEffect(() => {
    const player = playerRef.current
    const metronome = metronomeRef.current
    return () => {
      player?.stop()
      metronome?.stop()
    }
  }, [])

  // metronom de sine stătător: bate cât timp e activat și NU se redă (în timpul
  // redării, clicurile sunt programate de player, aliniate la note). Se repornește
  // la noul tempo dacă acesta se schimbă.
  useEffect(() => {
    const metronome = metronomeRef.current
    if (!metronome) return
    if (metronomeOn && !isPlaying) {
      void metronome.start(tempo, timeSignature)
    } else {
      metronome.stop()
    }
    return () => metronome.stop()
  }, [metronomeOn, isPlaying, tempo, timeSignature])

  function togglePlay() {
    const player = playerRef.current
    if (!player) return

    if (isPlaying) {
      player.stop()
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    // redă doar portativele bifate (Ctrl+click); fără bifare, redă toate
    const played =
      selectedStaffIds.length > 0 ? staves.filter((s) => selectedStaffIds.includes(s.id)) : staves
    // fiecare portativ își duce propria armură (poate diferi între instrumente)
    const parts = played.map((s) => ({ notes: s.notes, keySignature: s.keySignature }))
    // evidențiem portativul activ dacă e printre cele redate, altfel primul redat
    const activeAmongPlayed = played.findIndex((s) => s.id === activeStaffId)
    const highlightPartIndex = activeAmongPlayed >= 0 ? activeAmongPlayed : 0
    void player.play(parts, tempo, {
      metronome: metronomeOn,
      timeSignature,
      highlightPartIndex,
      onNote: (id) => dispatch({ type: "selectNote", id }),
      onEnd: () => setIsPlaying(false),
    })
  }

  function reset() {
    playerRef.current?.stop()
    setIsPlaying(false)
    // readucem selecția la prima notă a portativului activ, ca punct de pornire
    const activeNotes = staves.find((s) => s.id === activeStaffId)?.notes ?? []
    if (activeNotes.length > 0) dispatch({ type: "selectNote", id: activeNotes[0].id })
  }

  return (
    <footer className="flex h-13 shrink-0 items-center justify-between gap-6 border-t border-border bg-surface px-4 py-2">
      <div className="flex items-center gap-1.5">
        <Button
          variant={isPlaying ? "default" : "outline"}
          size="icon"
          onClick={togglePlay}
          aria-label={isPlaying ? "Stop" : "Play"}
        >
          {isPlaying ? <Square className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={reset}
          aria-label="Reia de la început"
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center gap-3">
        <span className="text-xs text-foreground-muted">Tempo</span>
        <Slider
          label="Tempo"
          className="w-40"
          min={40}
          max={240}
          step={1}
          value={[tempo]}
          onValueChange={(v) => setTempo(Array.isArray(v) ? v[0] : v)}
        />
        <span className="w-16 text-right text-sm tabular-nums text-foreground">
          ♩ = {tempo}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={metronomeOn ? "default" : "outline"}
          size="sm"
          onClick={() => setMetronomeOn((m) => !m)}
        >
          Metronom {metronomeOn ? "On" : "Off"}
        </Button>
      </div>
    </footer>
  )
}
