import { useEffect, useState } from "react"
import { Piano } from "lucide-react"
import { Button } from "@/components/ui/button"
import { enableMidi, disableMidi, isMidiSupported, onMidiStateChange } from "@/lib/midi/midiInput"

/**
 * Buton pentru intrarea MIDI: pornește/oprește ascultarea unei claviaturi externe.
 * Cât e pornit, notele cântate se introduc în portativul activ (tastele ținute
 * simultan → acord). Se ascunde dacă browserul nu suportă Web MIDI (ex. Firefox/Safari).
 */
export function MidiButton() {
  const [on, setOn] = useState(false)
  const [devices, setDevices] = useState<string[]>([])
  const [error, setError] = useState(false)

  useEffect(() => onMidiStateChange(setDevices), [])

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
    <Button variant={on ? "default" : "ghost"} size="sm" onClick={toggle} title={title}>
      <Piano className="size-4" />
      MIDI{on && devices.length > 1 ? ` · ${devices.length}` : ""}
    </Button>
  )
}
