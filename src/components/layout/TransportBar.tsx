import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Square, RotateCcw, Loader2 } from "lucide-react"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { playbackQuarterBpm } from "@/lib/notation/duration"
import { ScorePlayer } from "@/lib/audio/playback"
import { Metronome } from "@/lib/audio/metronome"
import { emitPlaybackHighlight } from "@/lib/audio/playbackHighlight"

/**
 * Bară de jos: control playback (play/stop) și tempo (BPM). Redarea folosește
 * motorul audio Tone.js (`ScorePlayer`) și citește notele din starea partajată;
 * pe durata redării, nota curentă e evidențiată direct în SVG (fără dispatch,
 * ca să nu re-randăm partitura la fiecare notă — vezi lib/audio/playbackHighlight).
 */
export function TransportBar() {
  const { staves, activeStaffId, selectedStaffIds, timeSignature, meta, playbackRate, setPlaybackRate, dispatch } =
    useScoreEditor()
  const [isPlaying, setIsPlaying] = useState(false)
  // adevărat cât timp se descarcă eșantioanele instrumentelor (doar primul Play)
  const [isPreparing, setIsPreparing] = useState(false)
  const [metronomeOn, setMetronomeOn] = useState(false)
  // BPM-ul efectiv în pătrimi: indicația notată (unitate de bătaie × număr) ajustată
  // cu viteza de redare. Tempo-ul notat e al piesei (în meta); viteza de redare e
  // un reglaj separat „pe parcurs", care nu schimbă indicația de pe foaie.
  const playbackBpm = playbackQuarterBpm(meta.tempo, meta.tempoBeat, meta.tempoBeatDotted, playbackRate)

  // un singur player și un singur metronom pe toată durata componentei
  const playerRef = useRef<ScorePlayer | null>(null)
  if (playerRef.current == null) playerRef.current = new ScorePlayer()
  const metronomeRef = useRef<Metronome | null>(null)
  if (metronomeRef.current == null) metronomeRef.current = new Metronome()

  // oprește redarea la demontarea componentei (evită sunet rămas în urmă)
  useEffect(() => {
    const player = playerRef.current
    const metronome = metronomeRef.current
    return () => {
      player?.stop()
      metronome?.stop()
      emitPlaybackHighlight(null)
    }
  }, [])

  // metronom de sine stătător: bate cât timp e activat și NU se redă (în timpul
  // redării, clicurile sunt programate de player, aliniate la note). Se repornește
  // la noul tempo dacă acesta se schimbă.
  useEffect(() => {
    const metronome = metronomeRef.current
    if (!metronome) return
    if (metronomeOn && !isPlaying) {
      void metronome.start(playbackBpm, timeSignature)
    } else {
      metronome.stop()
    }
    return () => metronome.stop()
  }, [metronomeOn, isPlaying, playbackBpm, timeSignature])

  function togglePlay() {
    const player = playerRef.current
    if (!player) return

    if (isPlaying) {
      player.stop()
      emitPlaybackHighlight(null)
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    // golim selecția de notă, ca singura notă aurie să fie cea redată
    dispatch({ type: "selectNote", id: null })
    // redă doar portativele bifate (Ctrl+click); fără bifare, redă toate
    const played =
      selectedStaffIds.length > 0 ? staves.filter((s) => selectedStaffIds.includes(s.id)) : staves
    // fiecare portativ își duce propria armură și propriul timbru de instrument
    const parts = played.map((s) => ({ notes: s.notes, keySignature: s.keySignature, instrument: s.instrument }))
    // evidențiem portativul activ dacă e printre cele redate, altfel primul redat
    const activeAmongPlayed = played.findIndex((s) => s.id === activeStaffId)
    const highlightPartIndex = activeAmongPlayed >= 0 ? activeAmongPlayed : 0
    // play() se rezolvă după programarea notelor (include descărcarea eșantioanelor)
    setIsPreparing(true)
    void player
      .play(parts, playbackBpm, {
        metronome: metronomeOn,
        timeSignature,
        highlightPartIndex,
        onNote: (id, durationSeconds) => emitPlaybackHighlight(id, durationSeconds),
        onEnd: () => {
          emitPlaybackHighlight(null)
          setIsPlaying(false)
        },
      })
      .finally(() => setIsPreparing(false))
  }

  function reset() {
    playerRef.current?.stop()
    emitPlaybackHighlight(null)
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
          {isPreparing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isPlaying ? (
            <Square className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
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
        <span className="text-xs text-foreground-muted">Viteză redare</span>
        <Slider
          label="Viteză redare"
          className="w-40"
          min={50}
          max={200}
          step={5}
          value={[playbackRate]}
          onValueChange={(v) => setPlaybackRate(Array.isArray(v) ? v[0] : v)}
        />
        <span className="w-10 text-xs tabular-nums text-foreground-muted">{playbackRate}%</span>
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
