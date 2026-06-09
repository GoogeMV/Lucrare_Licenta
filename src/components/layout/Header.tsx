import { Button } from "@/components/ui/button"

/**
 * Bara de sus a aplicației: identitatea aplicației + acțiuni globale
 * (fișier, export, schimbare temă, cont utilizator).
 */
export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
          NotationSoft
        </span>
      </div>

      <nav className="flex items-center gap-1">
        <Button variant="ghost" size="sm">
          Fișier
        </Button>
        <Button variant="ghost" size="sm">
          Export
        </Button>
        <Button variant="ghost" size="sm">
          Temă
        </Button>
      </nav>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm">
          Cont
        </Button>
      </div>
    </header>
  )
}
