import { useEffect, useState } from "react"
import { X } from "lucide-react"

/** Evenimentul prin care alte componente (ex. butonul din Header) deschid ajutorul */
export const TOGGLE_HELP_EVENT = "notationsoft:toggle-help"

type Section = { title: string; items: [string, string][] }

// Tastele și modurile — sursa unică pentru fereastra de ajutor (înlocuiește textul
// ghid care era sub portativ). `[taste, descriere]`.
const SECTIONS: Section[] = [
  {
    title: "Moduri",
    items: [
      ["N", "introducere note din tastatură"],
      ["M", "versuri (silabe sub note)"],
      ["Esc", "ieși din mod / deselectează"],
    ],
  },
  {
    title: "Mouse",
    items: [
      ["Click portativ", "adaugă o notă (devine activ)"],
      ["Click notă", "o selectează"],
      ["Shift+click / drag", "selectează un interval"],
      ["Alt+click", "adaugă/scoate o notă din selecție"],
      ["Ctrl+click portativ", "bifează pentru redare parțială"],
    ],
  },
  {
    title: "Editare note",
    items: [
      ["← / →", "circulă între note"],
      ["↑ / ↓", "schimbă înălțimea"],
      ["Q W E R T", "durata (întreagă → șaisprezecime)"],
      ["A S D F G", "pauză de durata corespunzătoare"],
      ["Enter", "notă nouă"],
      ["[ ] \\", "alterații (bemol / diez / becar)"],
      [".", "punct de prelungire"],
      ["P", "notă ↔ pauză"],
      ["L", "legato"],
      ["Ctrl+3", "triolet"],
      ["Delete", "șterge"],
    ],
  },
  {
    title: "Mod introducere (N)",
    items: [
      ["C D E F G A B", "introdu nota (octava cea mai apropiată)"],
      ["0", "pauză"],
      ["1–5", "durata"],
      ["Q", "deselectează (adaugi la final)"],
      ["N / Esc", "ieșire"],
    ],
  },
  {
    title: "Mod versuri (M)",
    items: [
      ["Space / Tab", "salvează + nota următoare"],
      ["Shift+Tab", "nota anterioară"],
      ["Enter / Esc", "termină (păstrează silaba)"],
    ],
  },
  {
    title: "Redare & global",
    items: [
      ["Space", "redă (selecția / portativul bifat / tot)"],
      ["Ctrl+Z / Ctrl+Y", "anulează / refă"],
      ["Ctrl+C / X / V", "copiază / taie / lipește"],
      ["0–9 (în TAB)", "setează fret-ul notei selectate"],
    ],
  },
  {
    title: "Intrare MIDI",
    items: [
      ["buton MIDI", "pornește o claviatură externă (Chrome/Edge)"],
      ["o tastă", "introduce nota în portativul activ"],
      ["taste ținute", "acord pe nota curentă"],
    ],
  },
]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border bg-surface-hover px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-foreground">
      {children}
    </kbd>
  )
}

/**
 * Fereastra de ajutor (taste & moduri), deschisă cu tasta H (sau din butonul „?"
 * din Header). Se închide cu H din nou, Esc, × sau click pe fundal. Înlocuiește
 * textul ghid care stătea sub portativ.
 */
export function HelpOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // nu deschide când scrii într-un câmp (titlu, versuri etc.)
      const target = event.target as HTMLElement | null
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (event.key === "Escape") {
        setOpen(false)
        return
      }
      if (event.key.toLowerCase() === "h" && !event.ctrlKey && !event.metaKey && !event.altKey && !typing) {
        event.preventDefault()
        setOpen((o) => !o)
      }
    }
    function onToggle() {
      setOpen((o) => !o)
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(TOGGLE_HELP_EVENT, onToggle)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(TOGGLE_HELP_EVENT, onToggle)
    }
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Taste &amp; moduri</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Închide"
            className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-foreground-muted uppercase">
                {section.title}
              </h3>
              <ul className="flex flex-col gap-1">
                {section.items.map(([keys, desc]) => (
                  <li key={keys} className="flex items-baseline gap-2 text-sm">
                    <span className="shrink-0">
                      <Kbd>{keys}</Kbd>
                    </span>
                    <span className="text-foreground-muted">{desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-foreground-muted">
          Apasă <Kbd>H</Kbd> sau <Kbd>Esc</Kbd> pentru a închide.
        </p>
      </div>
    </div>
  )
}
