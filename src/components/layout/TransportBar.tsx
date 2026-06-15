import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Square, RotateCcw, Loader2, SlidersHorizontal, Volume2, VolumeX } from "lucide-react"
import { useScoreEditor } from "@/state/scoreEditorContext"
import { playbackQuarterBpm } from "@/lib/notation/duration"
import { Metronome } from "@/lib/audio/metronome"
import { emitPlaybackHighlight } from "@/lib/audio/playbackHighlight"

const CLEF_SHORT: Record<string, string> = { treble: "sol", bass: "fa", alto: "do" }

/**
 * Bară de jos: control playback (play/stop) și tempo (BPM). Redarea folosește
 * motorul audio Tone.js (`ScorePlayer`) și citește notele din starea partajată;
 * pe durata redării, nota curentă e evidențiată direct în SVG (fără dispatch,
 * ca să nu re-randăm partitura la fiecare notă — vezi lib/audio/playbackHighlight).
 */
export function TransportBar() {
  const {
    staves,
    activeStaffId,
    selectedStaffIds,
    timeSignature,
    meta,
    playbackRate,
    setPlaybackRate,
    mixer,
    setStaffVolume,
    toggleStaffMute,
    player,
    isPlaying,
    setIsPlaying,
    dispatch,
  } = useScoreEditor()
  const [mixerOpen, setMixerOpen] = useState(false)
  const mixerRef = useRef<HTMLDivElement>(null)
  // adevărat cât timp se descarcă eșantioanele instrumentelor (doar primul Play)
  const [isPreparing, setIsPreparing] = useState(false)
  const [metronomeOn, setMetronomeOn] = useState(false)
  // BPM-ul efectiv în pătrimi: indicația notată (unitate de bătaie × număr) ajustată
  // cu viteza de redare. Tempo-ul notat e al piesei (în meta); viteza de redare e
  // un reglaj separat „pe parcurs", care nu schimbă indicația de pe foaie.
  const playbackBpm = playbackQuarterBpm(meta.tempo, meta.tempoBeat, meta.tempoBeatDotted, playbackRate)

  // player-ul e partajat (în context, folosit și de Space); metronomul e local
  const metronomeRef = useRef<Metronome | null>(null)
  if (metronomeRef.current == null) metronomeRef.current = new Metronome()

  // închide popover-ul mixerului la click în afara lui
  useEffect(() => {
    if (!mixerOpen) return
    function onMouseDown(event: MouseEvent) {
      if (!mixerRef.current?.contains(event.target as Node)) setMixerOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [mixerOpen])

  // oprește metronomul la demontarea componentei (player-ul e curățat de context)
  useEffect(() => {
    const metronome = metronomeRef.current
    return () => {
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
    // fiecare portativ își duce propria armură, timbrul și reglajul de mixer
    const parts = played.map((s) => ({
      notes: s.notes,
      keySignature: s.keySignature,
      instrument: s.instrument,
      volume: mixer[s.id]?.volume ?? 1,
      muted: mixer[s.id]?.muted ?? false,
    }))
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
    player.stop()
    emitPlaybackHighlight(null)
    setIsPlaying(false)
    // readucem selecția la prima notă a portativului activ, ca punct de pornire
    const activeNotes = staves.find((s) => s.id === activeStaffId)?.notes ?? []
    if (activeNotes.length > 0) dispatch({ type: "selectNote", id: activeNotes[0].id })
  }

  return (
    <footer className="frame bar-cream flex h-13 shrink-0 items-center justify-between gap-6 border-t border-border bg-bar px-4 py-2">
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
        <div ref={mixerRef} className="relative">
          <Button
            variant={mixerOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setMixerOpen((o) => !o)}
            title="Mixer — volum și mut per instrument"
          >
            <SlidersHorizontal className="size-4" /> Mixer
          </Button>
          {mixerOpen && (
            <div className="menu-light absolute bottom-full right-0 z-50 mb-2 w-72 rounded-md border border-border bg-surface p-2 shadow-lg">
              <p className="px-1 pb-1.5 text-[11px] font-medium text-foreground-muted">
                Volum și mut per instrument
              </p>
              {staves.length === 0 ? (
                <p className="px-1 py-1 text-xs text-foreground-muted">Niciun portativ.</p>
              ) : (
                <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
                  {staves.map((staff) => {
                    const muted = mixer[staff.id]?.muted ?? false
                    const volume = mixer[staff.id]?.volume ?? 1
                    return (
                      <div key={staff.id} className="flex items-center gap-2 rounded-sm px-1 py-1">
                        <button
                          type="button"
                          onClick={() => toggleStaffMute(staff.id)}
                          aria-label={muted ? "Activează sunetul" : "Mut"}
                          className={
                            muted
                              ? "rounded-sm p-1 text-destructive transition-colors hover:bg-surface-hover"
                              : "rounded-sm p-1 text-foreground-muted transition-colors hover:bg-surface-hover hover:text-primary"
                          }
                        >
                          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                        </button>
                        <span className="w-24 shrink-0 truncate text-xs text-foreground" title={staff.instrument}>
                          {staff.instrument}
                          <span className="text-foreground-muted"> · {CLEF_SHORT[staff.clef] ?? staff.clef}</span>
                        </span>
                        <Slider
                          label={`Volum ${staff.instrument}`}
                          className="flex-1"
                          min={0}
                          max={100}
                          step={5}
                          value={[Math.round(volume * 100)]}
                          onValueChange={(v) => setStaffVolume(staff.id, (Array.isArray(v) ? v[0] : v) / 100)}
                          disabled={muted}
                        />
                        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-foreground-muted">
                          {muted ? "—" : `${Math.round(volume * 100)}%`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
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
