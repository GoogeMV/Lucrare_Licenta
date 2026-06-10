# NotationSoft — editor de partituri (proiect de licență)

Editor de notație muzicală în browser, în stilul MuseScore. **WIP — UI-ul nefinalizat
e intenționat** (ex. butoanele Temă/Cont): evaluează fundația și direcția, nu
completitudinea. UI-ul și comentariile sunt în **română** — păstrează convenția.

## Comenzi

```bash
npm run dev      # Vite dev server pe http://localhost:5173
npm run build    # tsc -b && vite build (type-check + bundle)
npm run lint     # eslint . (țintă: 0 erori)
```

Nu există teste automate. Verificarea = build verde + testare manuală în browser.

## Stack

React 19 + TypeScript (strict), Vite 8, VexFlow 5 (randare SVG), Tone.js (audio),
Tailwind 4 + shadcn/base-ui. Alias `@/` → `src/`.

## Arhitectură (sursa unică de adevăr)

- **`src/state/scoreReducer.ts`** — modelul partiturii + toate operațiile de editare,
  ca reducer pur. `ScoreState.staves: Staff[]` (fiecare cu `clef`, `keySignature`,
  `notes`, `slurs`, opțional `groupId` pentru sistemul de pian) + `timeSignature`
  global (păstrează alinierea barelor). Înfășurat în `historyReducer` (undo/redo —
  snapshot DOAR la schimbări de conținut, detectate prin identitatea referințelor).
  **Orice operație nouă de editare = un nou `ScoreAction` aici**, UI-ul doar dă dispatch.
- **`src/state/scoreEditorContext.tsx`** — provider + `useScoreEditor()`. Tot aici:
  `ScoreMeta` (titlu/compozitor/tempo — date ale piesei, dar ÎN AFARA istoricului
  undo) și `viewMode` (pagină/continuu — preferință de UI).
- **`src/lib/notation/`** — module pure de teorie muzicală (pitch, duration, measure,
  keySignature, timeSignature, instrument, accidental, articulation). Fără React,
  fără VexFlow în tipuri. `entryBeats()` e SINGURA sursă pentru durate efective
  (punctul de prelungire +50%) — folosită de randare, redare și export.
- **`src/lib/audio/`** — `playback.ts` (ScorePlayer: programare pe ceasul audio),
  `instruments.ts` (eșantioane reale cu cache + fallback pe sintetizator),
  `metronome.ts`, `playbackHighlight.ts` (pub/sub care OCOLEȘTE React la redare —
  evidențierea/cursorul recolorează direct SVG-ul; un dispatch per notă ar
  reconstrui toată partitura).
- **`src/lib/export/musicxml.ts`** — export score-partwise 3.1 (se deschide în
  MuseScore). Părțile se umplu la același număr de măsuri cu pauze de măsură.
- **`src/components/notation/InteractiveStave.tsx`** — toată randarea VexFlow
  (layout pe măsuri/sisteme, acolade pian, beaming, legato) + interacțiunea
  (click, tastatură, modul N de introducere). Cel mai mare fișier — citește-l
  înainte să-l modifici.

## Capcane cunoscute

- **Id-urile** (`note-N`, `staff-N`) vin din contoare la nivel de modul în
  scoreReducer; la încărcarea unei partituri salvate, `syncIdCounters` TREBUIE
  să rămână apelat (altfel id-uri duplicate).
- **Diagnosticele IDE pot fi învechite** imediat după editări — sursa de adevăr
  e `npx tsc -b` / `npm run lint`.
- Schimbările de formă a stării (context/reducer) strică starea HMR — cere un
  refresh manual de browser după astfel de modificări.
- VexFlow randează SVG-ul cu `pointer-events: none` — InteractiveStave îl
  reactivează explicit; nu șterge acel cod.
- Eșantioanele de instrumente vin de pe un CDN extern (tonejs-instruments);
  offline se cade automat pe sintetizator. URL-urile din `SAMPLE_SETS` au fost
  verificate — nu adăuga note-ancoră fără să verifici că fișierul există.

## Decizii luate (nu le re-deschide fără motiv)

- Măsura (time signature) rămâne globală — alinierea verticală a barelor între
  instrumente e prioritară polimetriei.
- Pianul la export MusicXML = două părți separate (nu grand staff cu acoladă) —
  simplificare asumată, menționată ca future work.
- Click-ul pe portativ adaugă note DOAR pe liniile portativului (±8px); notele
  cu linii suplimentare se obțin cu ↑/↓ — cerință explicită a utilizatorului.
- Punctul de prelungire (lângă cap, `dotted`) ≠ staccato (deasupra, articulație).
