import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Check } from "lucide-react"

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  "aria-label"?: string
  className?: string
  /** lățime minimă a popup-ului (altfel se ia după buton) */
  menuClassName?: string
}

/**
 * Dropdown custom (listbox), folosit în locul `<select>`-ului nativ pentru că
 * popup-ul nativ ignoră `:hover` și forțează albastrul de sistem. Aici hover-ul
 * și opțiunea selectată folosesc accentul auriu al temei (`--primary`), consistent
 * pe toate temele. Închidere la click-în-afară / Escape; navigare cu săgeți.
 */
export function Select({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  className = "",
  menuClassName = "",
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  // la deschidere, poziționează „activul" pe opțiunea curentă
  useEffect(() => {
    function syncActive() {
      setActiveIndex(options.findIndex((o) => o.value === value))
    }
    if (open) syncActive()
  }, [open, options, value])

  // ține opțiunea activă în vizor
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined
    node?.scrollIntoView({ block: "nearest" })
  }, [open, activeIndex])

  function commit(index: number) {
    const opt = options[index]
    if (opt) onChange(opt.value)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === "Escape") {
      setOpen(false)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      commit(activeIndex)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={
          "flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-hover px-2 text-xs text-foreground transition-colors hover:border-primary/60 focus-visible:border-primary focus-visible:outline-none " +
          className
        }
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className={
            "absolute top-full left-0 z-50 mt-1 max-h-72 min-w-full overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg " +
            menuClassName
          }
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            const isActive = i === activeIndex
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
                className={
                  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs whitespace-nowrap transition-colors " +
                  (isActive ? "bg-primary text-primary-foreground" : "text-foreground")
                }
              >
                <Check className={"size-3 shrink-0 " + (isSelected ? "opacity-100" : "opacity-0")} />
                {opt.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
