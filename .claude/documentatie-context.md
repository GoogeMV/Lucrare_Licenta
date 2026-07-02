# Context pentru redactarea lucrării de licență — NotationSoft

> **Pentru chat-ul care ajută la documentație:** acest fișier conține tot ce-ți
> trebuie ca să ajuți la scrierea lucrării de licență, fără a re-citi tot codul.
> Utilizatorul are deja **schița (outline-ul) de la profesor** — cere-i-o și
> mapează informația de mai jos pe capitolele cerute. Lucrarea e în **română**.
> Codul e sursa de adevăr; dacă afirmi ceva tehnic specific, verifică în fișierul
> indicat înainte. Vezi și `CLAUDE.md` (instrucțiuni de proiect) pentru convenții.

---

## 1. Ce este proiectul (rezumat de o frază)

NotationSoft = editor de notație muzicală în browser, în stilul MuseScore, cu
editare/redare/export al partiturilor, cont în cloud, partajare granulară între
utilizatori, panou de administrare cu statistici și un plan Pro opțional (plăți
Stripe în mod test). Proiect de licență (CTI). UI + comentarii în română.

## 2. Stack tehnologic (cu justificările de pus în lucrare)

| Tehnologie | De ce |
|---|---|
| **React 19 + TypeScript (strict)** | UI declarativ component-based; TS strict prinde erori la compilare, esențial într-o aplicație cu model de date complex |
| **Vite 8** | build/dev rapid (HMR), config minimă, alias `@/`→`src/` |
| **VexFlow 5** | bibliotecă matură de gravură muzicală (randează SVG: portative, chei, beaming, legato, TAB) — a reinventa gravura ar fi nefezabil |
| **Tone.js 15** | sinteză + programare audio pe ceasul `AudioContext`, peste Web Audio API; gestionează timing-ul precis al redării |
| **Tailwind 4 + shadcn/base-ui** | stilizare utility-first + componente accesibile; iterare rapidă pe UI |
| **Node + Express (ESM)** | backend minimal, fără pas de build; ecosistem matur |
| **PostgreSQL (`pg`)** | bază relațională robustă; partiturile în coloană `JSONB` (flexibil, dar interogabil). Pur-JS, fără build native |
| **JWT + bcryptjs** | autentificare stateless (token în header) + hashing parole |
| **Docker + Docker Compose + nginx** | reproductibilitate; tot stack-ul (db+server+web) cu o comandă |
| **Vitest** | teste unitare rapide; refolosește config-ul Vite |
| **Stripe (test mode)** | plăți reale simulate, fără bani; fallback pe pagină de plată simulată |

**De menționat:** alegerea PostgreSQL după ce `better-sqlite3` a fost respins (avea
nevoie de node-gyp/Visual Studio, absent în mediu). Lecție: evitarea dependențelor
native. (E o decizie reală, bună de pus la „provocări întâmpinate".)

## 3. Arhitectura (sursa unică de adevăr)

**Principiul central: modelul partiturii ca REDUCER PUR.** Toată logica de editare
trăiește într-o funcție pură; UI-ul doar dă `dispatch`. Asta face logica testabilă
și predictibilă.

Fișiere cheie (pentru capitolul de arhitectură):
- **`src/state/scoreReducer.ts`** — modelul (`ScoreState`: `staves: Staff[]` +
  `timeSignature` global + `barlines`/`repeatCounts`) și TOATE operațiile de
  editare ca `ScoreAction`. Înfășurat în `historyReducer` (undo/redo — snapshot
  doar la schimbări de conținut, detectate prin identitatea referințelor).
- **`src/state/scoreEditorContext.tsx`** — provider React + `useScoreEditor()`.
  Ține și `ScoreMeta` (titlu/compozitor/tempo — ÎN AFARA undo) și `viewMode`.
- **`src/lib/notation/`** — module PURE de teorie muzicală (pitch, duration,
  measure, keySignature, timeSignature, instrument, accidental, articulation,
  tab). Fără React, fără VexFlow. `entryBeats()` = sursa unică pentru durate.
- **`src/lib/audio/`** — `playback.ts` (programare pe ceasul audio), `instruments.ts`
  (eșantioane reale + cache de buffere + fallback sintetizator), `audition.ts`,
  `metronome.ts`, `playbackHighlight.ts` (pub/sub care OCOLEȘTE React la redare —
  evidențierea recolorează direct SVG-ul, ca să nu reconstruiască toată partitura).
- **`src/lib/export/musicxml.ts`** + **`src/lib/import/musicxml.ts`** — export/import.
- **`src/components/notation/InteractiveStave.tsx`** — toată randarea VexFlow +
  interacțiunea (click, tastatură, moduri N/M, MIDI, cursor de redare). Cel mai
  mare fișier (~1900 linii).
- **`server/`** — Express + PostgreSQL: `routes/` (auth, scores, shares, admin,
  billing), `store.js` (acces DB, query-uri parametrizate), `auth.js` (JWT +
  middleware), `scripts/admin.js` (CLI de acordare admin).

**Diagrame de inclus în lucrare (descriere):**
1. *Flux de date editare:* UI (eveniment) → `dispatch(action)` → `historyReducer`
   → `scoreReducer` (stare nouă) → re-randare VexFlow în `InteractiveStave`.
2. *Lanț audio redare:* `ScorePlayer.play(parts)` → `Tone.Sampler` per instrument
   (din cache de buffere) → programare pe ceasul audio; în paralel `playbackHighlight`
   (pub/sub) mută cursorul/recolorează notele DIRECT în SVG (ocolind React).
3. *Schema DB:* `users` (1)─(N) `scores`; `shares` leagă `score` + `owner` +
   `shared_with` cu `staff_ids` (JSONB) = portativele permise.
4. *Comunicare frontend↔backend:* browser → `/api/*` (token Bearer în header) →
   nginx (prod) / proxy Vite (dev) → Express → PostgreSQL.

## 4. Funcționalități implementate (lista pentru capitolul de implementare)

**Editare/notație:** note/acorduri/pauze; durate (întreagă→șaisprezecime) + punct
de prelungire; triolete; legato (slur); legături peste bară (tie, cu spargere
automată în măsuri); articulații (staccato etc.); nuanțe dinamice (pp–ff); tonalitate
(armură) și cheie per portativ; măsură globală (alinierea barelor); repetiții +
tipuri de bară (repeat/dublă/finală) cu număr de repetări ×N; copy/paste; selecție
pe interval (Shift), individuală (Alt), undo/redo; versuri sub portativ.

**Tablatură (TAB):** pentru chitare (inclusiv bas, 4 corzi); mapare automată pe
corzi; acorduri pe corzi DISTINCTE (fără suprapunere); clef TAB redimensionat.

**Audio:** redare cu eșantioane reale (CDN tonejs-instruments) + fallback sintetizator
offline; Play / pauză reală / stop; metronom; cursor care urmărește notele (până la
finalul celui mai lung instrument); audiție la editare; mini-mixer (volum + mut per
instrument); tempo unic (BPM) din bara de jos.

**Intrare MIDI (Web MIDI):** claviatură externă introduce note; acorduri (taste
ținute simultan); toggle pentru durata „din cât ții clapa" (cuantizată la tempo)
cu PREVIEW LIVE (nota crește optime→pătrime→…); tasta K comută modul.

**Cont/cloud/colaborare:** înregistrare/autentificare (JWT) sau „continuă deconectat"
(salvare locală); salvare în cont + autosave (3 min) + Ctrl+S; partajare GRANULARĂ
(acces doar la anumite portative, filtrat pe server, read-only); panou de admin
(statistici + utilizatori); plan Pro (Free = max 3 partituri, fără partajare).

**Import/export:** MusicXML (deschide în MuseScore), WAV, PDF (A4); export selectiv
(instrumente alese + interval de măsuri); import MusicXML.

**UI:** 4 teme (dark, light, signature-dark, signature-light); font Edwin (fontul
MuseScore 4); favicon cheie sol; overlay de ajutor (tasta H); dropdown-uri custom.

## 5. Decizii de design (cu rațiunea — material pentru „justificarea soluției")

- **Reducer pur ca sursă unică de adevăr** → logica testabilă, undo/redo gratuit,
  UI „prost" (doar dispatch). Separă logica de randare/IO.
- **Măsură (time signature) GLOBALĂ**, nu per-instrument → prioritizează alinierea
  verticală a barelor între instrumente (polimetria ar fi stricat alinierea).
- **Token JWT în header `Authorization` + localStorage** (nu cookie) → imun la
  CSRF prin design; tradeoff: expus teoretic la XSS (dar suprafață de XSS nulă —
  React escapează, fără HTML brut de la user). Alternativa (cookie httpOnly + CSRF)
  = future work.
- **Rol admin doar prin CLI server-side**, NICIODATĂ prin API → nicio cale de
  escaladare a privilegiilor. (Inițial era prin email în .env — vulnerabilitate,
  eliminată.)
- **Partajare filtrată pe SERVER** → destinatarul nu primește deloc părțile ascunse
  (nu doar UI care le ascunde).
- **Plăți verificate pe server** (sesiunea Stripe e plătită ȘI aparține userului) →
  nimeni nu poate „pretinde" Pro din client.
- **`playbackHighlight` ocolește React** → un dispatch per notă ar reconstrui toată
  partitura la fiecare 16-ime de secundă; în loc, recolorăm SVG-ul direct.
- **Pian la export MusicXML = două părți separate** (nu grand staff cu acoladă) —
  simplificare asumată.
- **Click pe portativ adaugă note doar pe liniile portativului** (±8px); liniile
  suplimentare se obțin cu ↑/↓ — cerință explicită.

## 6. Securitate (capitol dedicat — ce e + limitări asumate)

**Implementat:** parole bcrypt (cost 10); JWT semnat (expirare 30 zile), verificat
pe fiecare rută protejată; **toate** query-urile SQL parametrizate (fără injection);
autorizare în interogări (`user_id`/`owner_id`/`shared_with_id`); admin doar prin
CLI (fără escaladare); adminii nu se pot șterge reciproc/pe ei înșiși prin API;
partajare filtrată server-side; plăți verificate server-side; limite Free aplicate
pe server (402); validare de bază (email, parolă ≥6); limită corp cerere 8 MB;
**helmet** (security headers), **rate limiting** la login/register (30/10min/IP),
`JWT_SECRET` obligatoriu în producție.

**Limitări asumate (future work):** CORS deschis (risc mic — API pe token în header,
nu cookie); JWT în localStorage (expus teoretic la XSS); fără verificare email /
resetare parolă; tokenele nu se pot revoca înainte de expirare (JWT stateless).

**Formulare bună pentru apărare:** „Autentificare cu Bearer token în header — imună
la CSRF prin design. Tokenul în localStorage e expus teoretic la XSS, dar suprafața
de XSS e nulă. CORS deschis nu e exploatabil (fără cookie-uri). Hardening ulterior:
cookie httpOnly + CSRF + CORS strict."

## 7. Testare (capitol)

**Vitest** — 59 de teste în 8 fișiere, co-locate lângă module (`*.test.ts`), pe
**logica pură**: `src/lib/notation/*` (pitch, duration+cuantizare, measure+repetiții,
keySignature, timeSignature, tab+acorduri), `src/lib/export/musicxml.ts`,
`src/state/scoreReducer.ts` (reducer + undo/redo). Rulare: `npm test`.
**NU** se testează automat (intenționat): UI, randarea VexFlow, audio (Tone), MIDI,
backend — verificate manual în browser (backend și smoke-testat live). Argumentul:
separarea logicii pure de randare/IO face miezul testabil; restul ar avea cost mare
și valoare mică.

## 8. Limitări cunoscute / dezvoltări ulterioare (capitolul de concluzii)

- Voci multiple pe același portativ; schimbări de tonalitate/măsură la mijloc.
- Volte (finale 1/2), repetiții imbricate; repetițiile NU se reflectă în export
  WAV/MusicXML (se exportă „ca scris").
- Note de ornament / appoggiatura.
- Pian la export MusicXML = două părți separate (nu grand staff).
- `InteractiveStave.tsx` mare (~1900 linii) — s-ar putea sparge în hook-uri.
- Re-randare completă VexFlow la fiecare editare (ok, redarea ocolește React).
- Securitate: cookie httpOnly + CSRF + CORS strict; rate limit pe mai multe rute.
- Idei: bibliotecă de partituri, inserare/ștergere de măsuri, transpunere în masă, zoom.

## 9. Rulare / comenzi (pentru anexe / capitol de implementare)

```
npm run dev      # frontend Vite :5173
npm run total    # frontend + backend împreună
npm run build    # tsc -b + vite build
npm run lint     # eslint
npm test         # vitest
docker compose up --build   # tot stack-ul → web pe :8090
```
Admin: `docker compose exec server npm run admin -- set <email> on` (sau local
`cd server && npm run admin -- set <email> on`). Detalii în `README.md` + `server/README.md`.

## 10. Pontoane pentru redactare

- Pune **capturi de ecran** pentru fiecare funcționalitate majoră (editor, TAB,
  mixer, partajare, admin, cele 4 teme).
- La „provocări întâmpinate" sunt povești reale: bug-ul de pauză audio (Tone golea
  `_activeSources` → soluția cu `dispose()`); culoarea versurilor (VexFlow injecta
  CSS pe `svg text` → `context.fillText`); dependența nativă respinsă (better-sqlite3).
- La „arhitectură" insistă pe **reducer pur + separarea logicii de randare** — e cel
  mai puternic argument de design.
- Limba: română (convenția proiectului). Termenii tehnici pot rămâne în engleză.

---

**Statusul codului (la data scrierii):** complet funcțional, 59 teste verde, fără
cod mort, review complet făcut (backend + frontend + audio), securitate întărită.
Nu mai e nimic de implementat — rămâne doar lucrarea scrisă.
