import type { Duration } from "@/types/score"
import { cn } from "@/lib/utils"

/**
 * Iconiță SVG pentru o valoare de notă (întreagă, doime, pătrime, optime,
 * șaisprezecime), opțional cu punct de prelungire. O desenăm noi fiindcă
 * simbolurile muzicale Unicode (doime, șaisprezecime, note cu punct) au coada
 * și steagurile ca semne combinatorii separate care nu se „lipesc" corect în
 * majoritatea fonturilor (coada apare detașată de cap). Folosește `currentColor`,
 * deci moștenește culoarea textului (merge și pe butoanele active din toolbar).
 */
export function NoteValueIcon({
  duration,
  dotted,
  className,
}: {
  duration: Duration
  dotted?: boolean
  className?: string
}) {
  const open = duration === "whole" || duration === "half"
  const hasStem = duration !== "whole"
  const flags = duration === "eighth" ? 1 : duration === "sixteenth" ? 2 : 0

  return (
    <svg
      viewBox="0 0 18 26"
      width="0.85em"
      height="1.25em"
      fill="none"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
    >
      {/* coada (toate în afară de nota întreagă) */}
      {hasStem && (
        <line x1="9.5" y1="18.5" x2="9.5" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      )}
      {/* steaguri: unul pentru optime, două pentru șaisprezecime */}
      {flags >= 1 && (
        <path d="M9.5 4 c 4.6 1.6 4.9 5 2.2 7.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
      {flags >= 2 && (
        <path d="M9.5 8.4 c 4.6 1.6 4.9 5 2.2 7.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
      {/* capul notei (gol pentru întreagă/doime, plin în rest) */}
      <ellipse
        cx="6"
        cy="19"
        rx="4"
        ry="2.9"
        transform="rotate(-22 6 19)"
        fill={open ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={open ? 1.5 : 0}
      />
      {/* punctul de prelungire, lângă cap */}
      {dotted && <circle cx="12.7" cy="19" r="1.4" fill="currentColor" />}
    </svg>
  )
}
