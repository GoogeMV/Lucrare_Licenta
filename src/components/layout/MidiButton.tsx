import { useEffect, useState } from "react"
import { Piano, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  enableMidi,
  disableMidi,
  isMidiSupported,
  onMidiStateChange,
  isMidiDurationFromHold,
  setMidiDurationFromHold,
  onMidiModeChange,
} from "@/lib/midi/midiInput"

/**
 * Buton pentru intrarea MIDI: pornește/oprește ascultarea unei claviaturi externe.
 * Cât e pornit, notele cântate se introduc în portativul activ (tastele ținute
 * simultan → acord). Se ascunde dacă browserul nu suportă Web MIDI (ex. Firefox/Safari).
 *
 * Cât e pornit, un al doilea buton comută modul de durată: implicit nota ia durata
 * aleasă din toolbar; pe „⏱" durata vine din cât ții clapa apăsată (cuantizată la tempo).
 */
export function MidiButton() {
  const [on, setOn] = useState(false)
  const [devices, setDevices] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [holdDuration, setHoldDuration] = useState(isMidiDurationFromHold())

  useEffect(() => onMidiStateChange(setDevices), [])
  useEffect(() => onMidiModeChange(setHoldDuration), [])

  async function toggle() {
    if (on) {
      disableMidi()
      setOn(false)
      return
    }
    try {
      await enableMidi()
      setOn(true)
      setError(false)
    } catch {
      setError(true)
      setOn(false)
    }
  }

  if (!isMidiSupported()) return null

  const title = error
    ? "Acces MIDI refuzat sau indisponibil"
    : on
      ? devices.length
        ? `MIDI pornit — ${devices.join(", ")}`
        : "MIDI pornit — conectează o claviatură"
      : "Pornește intrarea MIDI (claviatură externă)"

  return (
    <div className="flex items-center gap-1">
      <Button variant={on ? "default" : "ghost"} size="sm" onClick={toggle} title={title}>
        <Piano className="size-4" />
        MIDI{on && devices.length > 1 ? ` · ${devices.length}` : ""}
      </Button>
      {on && (
        <Button
          variant={holdDuration ? "default" : "ghost"}
          size="sm"
          onClick={() => setMidiDurationFromHold(!holdDuration)}
          title={
            holdDuration
              ? "Durata notei vine din cât ții clapa apăsată (cuantizată la tempo). Apasă (sau K) pentru durată fixă din toolbar."
              : "Durata notei = cea aleasă din toolbar. Apasă (sau K) ca durata să vină din cât ții clapa apăsată."
          }
        >
          <Timer className="size-4" />
        </Button>
      )}
    </div>
  )
}
