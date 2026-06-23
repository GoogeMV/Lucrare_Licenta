# NotationSoft

Editor de notație muzicală în browser, în stilul MuseScore — scris ca **proiect de
licență** (CTI). Permite scrierea, editarea, redarea audio și exportul partiturilor,
cu cont în cloud, partajare între utilizatori, panou de administrare și un plan Pro
opțional (plăți Stripe în mod test).

> **Stare:** proiect de licență funcțional. Interfața și comentariile din cod sunt
> în **română** (convenție păstrată în tot proiectul).

---

## Cuprins

- [Funcționalități](#funcționalități)
- [Stack tehnologic](#stack-tehnologic)
- [Cerințe](#cerințe)
- [Pornire rapidă (doar frontend)](#pornire-rapidă-doar-frontend)
- [Stack complet (frontend + backend + DB)](#stack-complet-frontend--backend--db)
- [Rulare cu Docker](#rulare-cu-docker)
- [Variabile de mediu](#variabile-de-mediu)
- [Administrare (rol admin)](#administrare-rol-admin)
- [Plăți / planul Pro (Stripe test)](#plăți--planul-pro-stripe-test)
- [Comenzi disponibile](#comenzi-disponibile)
- [Arhitectură](#arhitectură)
- [Structura proiectului](#structura-proiectului)
- [Scurtături de tastatură](#scurtături-de-tastatură)
- [Testare și verificare](#testare-și-verificare)
- [Limitări cunoscute / lucru viitor](#limitări-cunoscute--lucru-viitor)
- [Licență](#licență)

---

## Funcționalități

**Editare partitură**
- Mai multe instrumente/portative pe aceeași partitură (corzi, suflători, voce/cor,
  chitare, pian cu acoladă).
- Introducere note prin click pe portativ, tastatură (modul **N**), sau **MIDI**
  (claviatură reală prin Web MIDI).
- Acorduri, pauze, legato (slur), legături peste bară (tie), punct de prelungire,
  articulații (staccato etc.), nuanțe dinamice (pp–ff), **triolete**.
- Tonalitate (armură) și cheie per portativ; măsură (time signature) comună, ca
  barele să rămână aliniate vertical.
- **Tablatură (TAB)** pentru chitare (inclusiv chitară bas, 4 corzi), cu mapare
  automată pe corzi distincte pentru acorduri.
- **Versuri** sub portativ (mod dedicat, tasta **M**).
- **Repetiții** și tipuri de bară (repeat-begin/end, dublă, finală) cu număr de
  repetări (×N) — incluse la redare.
- Copy/paste, selecție pe interval (Shift), selecție individuală (Alt), undo/redo.

**Audio**
- Redare cu eșantioane reale de instrumente (CDN `tonejs-instruments`), cu
  *fallback* automat pe sintetizator când ești offline.
- Play / **pauză reală** / stop, metronom, cursor de redare care urmărește notele.
- Audiție: nota selectată sună cât e selectată, se taie când treci la alta.
- Mini-mixer: volum și *mute* per instrument.
- Tempo unic (BPM) controlat din bara de jos, sincronizat cu indicația de pe foaie.

**Cont, cloud, colaborare**
- Înregistrare / autentificare (JWT), sau **continuă deconectat** (salvare locală).
- Salvare în cont (cloud) + **autosave** la 3 minute + **Ctrl+S**.
- **Partajare granulară**: dai acces altui utilizator doar la anumite portative
  ale unei partituri (read-only).
- **Panou de administrare**: statistici + listă utilizatori (doar pentru admini).
- **Plan Pro** opțional (Stripe test sau plată simulată): Free = max 3 partituri,
  fără partajare; Pro = nelimitat + partajare.

**Import / export**
- Export **MusicXML** (se deschide în MuseScore), **WAV**, **PDF** (A4, prin
  dialogul de print).
- Export selectiv (instrumente alese + interval de măsuri).
- Import **MusicXML**.

**Interfață**
- **4 teme**: `dark`, `light`, `signature-dark` (burgundy/auriu), `signature-light`
  (ramă verde + pergament + lemn). Accent auriu pe toate temele.
- Font de partitură **Edwin** (fontul de text al MuseScore 4).
- Overlay de ajutor cu toate scurtăturile (tasta **H**).

---

## Stack tehnologic

| Zonă | Tehnologii |
|---|---|
| Frontend | React 19 + TypeScript (strict), Vite 8 |
| Notație (randare) | VexFlow 5 (SVG) |
| Audio | Tone.js 15 |
| Stilizare | Tailwind 4 + shadcn / base-ui |
| Backend | Node + Express (ESM), JWT, bcryptjs |
| Bază de date | PostgreSQL (`pg`, JSONB pentru partituri) |
| Plăți | Stripe (mod test) — opțional |
| Teste | Vitest |
| Containerizare | Docker + Docker Compose, nginx |

Alias de import: `@/` → `src/`.

---

## Cerințe

- **Node.js 20+** (recomandat 22) și npm.
- Pentru cont/cloud: **PostgreSQL 14+** (sau Docker).
- Opțional: **Docker** + Docker Compose (rulează tot stack-ul fără să instalezi
  Node/Postgres local).

> Doar editorul de partituri (fără cont) funcționează din frontend, fără backend
> și fără bază de date.

---

## Pornire rapidă (doar frontend)

Pentru a folosi editorul fără cont (salvare doar locală, în browser):

```bash
npm install
npm run dev          # Vite → http://localhost:5173
```

Deschide http://localhost:5173. Apasă **H** pentru lista de scurtături.

---

## Stack complet (frontend + backend + DB)

Necesită PostgreSQL pornit și o bază de date creată o singură dată:

```bash
createdb notationsoft          # sau în psql: CREATE DATABASE notationsoft;
```

Configurează backend-ul:

```bash
cd server
npm install
# creează server/.env cu cel puțin:
#   JWT_SECRET=un-secret-aleator
#   DATABASE_URL=postgresql://postgres:parolă@localhost:5432/notationsoft
```

Rulează **ambele** procese deodată, din rădăcină:

```bash
npm install                    # (o singură dată, dacă n-ai rulat deja)
npm run total                  # frontend (:5173) + backend (:4000) împreună
```

`npm run total` pornește în paralel `vite` (web) și `node --watch` (api), colorate
`web`/`api`. Frontend-ul proxează automat `/api` → `http://localhost:4000`
(vezi `vite.config.ts`), deci nu trebuie configurat nimic în plus.

Alternativ, în două terminale separate:

```bash
npm run dev                    # rădăcină — frontend :5173
cd server && npm run dev       # backend :4000
```

Detalii suplimentare despre backend: [`server/README.md`](server/README.md).

---

## Rulare cu Docker

Tot stack-ul (Postgres + server + web) în containere, fără să instalezi nimic local:

```bash
docker compose up --build
```

- Web (frontend + proxy `/api`): http://localhost:8090
- API (opțional, expus pentru depanare): http://localhost:4000
- PostgreSQL: în container, cu volum persistent `pgdata`

Serviciile (vezi [`docker-compose.yml`](docker-compose.yml)):
- **db** — `postgres:16-alpine`, healthcheck, volum `pgdata`.
- **server** — build din `server/Dockerfile` (Node, fără pas de build).
- **web** — build Vite → nginx (`Dockerfile` + `nginx.conf`), servește `dist` cu
  *SPA fallback* și proxează `/api` → `server:4000`.

Variabilele se pot suprascrie dintr-un `.env` în rădăcină (vezi mai jos). Implicit
pornește fără Stripe (upgrade-ul folosește plata **simulată**).

---

## Variabile de mediu

**Backend** (`server/.env`):

| Variabilă | Necesară | Descriere |
|---|---|---|
| `PORT` | nu (4000) | portul API-ului |
| `JWT_SECRET` | **da** | secretul de semnare a tokenelor (schimbă-l!) |
| `DATABASE_URL` | **da** | `postgresql://user:parolă@host:5432/notationsoft` |
| `CLIENT_URL` | pentru Stripe | URL-ul frontend-ului (redirect după plată) |
| `STRIPE_SECRET_KEY` | opțional | cheia secretă de **test** `sk_test_…` |
| `STRIPE_PRICE_ID` | opțional | un Preț *one-time* din Stripe (mod test) |

În Docker, aceleași variabile se pot pune într-un `.env` din **rădăcină**
(`docker-compose.yml` le citește): `POSTGRES_PASSWORD`, `JWT_SECRET`, `CLIENT_URL`,
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`.

---

## Administrare (rol admin)

Panoul de admin (statistici + utilizatori) e protejat de rolul `is_admin`. Din
motive de securitate, **rolul se acordă DOAR pe server, prin CLI — niciodată printr-un
endpoint API** (nu există cale de escaladare). Contul trebuie să existe deja.

Local:

```bash
cd server
npm run admin -- set eu@example.com on    # promovează la admin
npm run admin -- set eu@example.com off   # retrogradează
npm run admin -- list                     # listează adminii
```

În Docker:

```bash
docker compose exec server npm run admin -- set eu@example.com on
docker compose exec server npm run admin -- list
```

În plus, un admin **nu** poate șterge un alt admin sau propriul cont prin API.

---

## Plăți / planul Pro (Stripe test)

Upgrade-ul la **Pro** folosește Stripe Checkout în **mod test** (carduri de test,
fără bani reali). **Fără chei configurate**, aplicația cade automat pe o pagină de
plată **simulată** (demo) — deci totul merge end-to-end și fără cont Stripe.

Configurare reală (Stripe test) în `server/.env`:

```
STRIPE_SECRET_KEY=sk_test_...     # cheia secretă de TEST
STRIPE_PRICE_ID=price_...         # un Preț one-time, în mod test
CLIENT_URL=http://localhost:5173  # (Docker: http://localhost:8090)
```

În dashboard-ul Stripe (mod Test): creează un **Product** cu un **Price one-time**,
copiază `price_…` și `sk_test_…`. Card de test: `4242 4242 4242 4242`, dată
viitoare, orice CVC. Planuri: **Free** = max 3 partituri, fără partajare; **Pro** =
nelimitat + partajare.

---

## Comenzi disponibile

**Rădăcină** (frontend):

| Comandă | Efect |
|---|---|
| `npm run dev` | Vite dev server pe http://localhost:5173 |
| `npm run total` | frontend **și** backend împreună (concurrently) |
| `npm run build` | `tsc -b && vite build` (type-check + bundle) |
| `npm run preview` | servește build-ul de producție |
| `npm run lint` | ESLint (țintă: 0 erori) |
| `npm test` | Vitest — teste unitare |
| `npm run test:watch` | Vitest în mod watch |

**Backend** (`server/`):

| Comandă | Efect |
|---|---|
| `npm run dev` | `node --watch src/index.js` → :4000 |
| `npm start` | pornire fără watch |
| `npm run admin -- …` | CLI de administrare (vezi mai sus) |

Verificare completă = **build verde** + `npm test` + testare manuală în browser.
Testele acoperă logica pură (`lib/notation/*`, export MusicXML, `scoreReducer`);
UI-ul și randarea VexFlow se verifică manual.

---

## Arhitectură

Sursa unică de adevăr e modelul partiturii ca **reducer pur**:

- **`src/state/scoreReducer.ts`** — modelul (`ScoreState.staves: Staff[]` +
  `timeSignature` global) și **toate** operațiile de editare. Înfășurat în
  `historyReducer` (undo/redo). Orice operație nouă = o nouă acțiune aici; UI-ul
  doar dă *dispatch*.
- **`src/state/scoreEditorContext.tsx`** — provider + `useScoreEditor()`; ține și
  `ScoreMeta` (titlu/compozitor/tempo — în afara undo) și `viewMode`.
- **`src/lib/notation/`** — module pure de teorie muzicală (pitch, duration,
  measure, keySignature, timeSignature, instrument, accidental, articulation,
  **tab**). Fără React, fără VexFlow în tipuri.
- **`src/lib/audio/`** — `playback.ts` (programare pe ceasul audio), `instruments.ts`
  (eșantioane + cache + fallback sintetizator), `metronome.ts`, `audition.ts`,
  `playbackHighlight.ts` (pub/sub care ocolește React la redare).
- **`src/lib/export/musicxml.ts`** + **`src/lib/import/musicxml.ts`** — export/import.
- **`src/components/notation/InteractiveStave.tsx`** — toată randarea VexFlow și
  interacțiunea (click, tastatură, moduri). Cel mai mare fișier.
- **`server/`** — Express + PostgreSQL: `routes/` (auth, scores, shares, admin,
  billing), `store.js` (acces DB), `auth.js` (JWT middleware), `scripts/admin.js`.

Mai multe detalii și „capcane cunoscute" în [`CLAUDE.md`](CLAUDE.md).

---

## Structura proiectului

```
notation-app/
├─ src/
│  ├─ components/        # UI: layout, notație (InteractiveStave), ui/ (componente)
│  ├─ state/            # scoreReducer, context, hooks (useSaveScore), authContext
│  ├─ lib/
│  │  ├─ notation/      # teorie muzicală pură (+ tab.ts)
│  │  ├─ audio/         # playback, instrumente, metronom, audiție
│  │  ├─ export/        # MusicXML, WAV
│  │  ├─ import/        # MusicXML
│  │  ├─ midi/          # intrare Web MIDI
│  │  └─ api/           # client HTTP către backend
│  ├─ types/            # tipuri (score.ts)
│  └─ index.css         # teme (variabile CSS) + font-uri + scrollbar
├─ server/              # backend Node/Express + PostgreSQL (vezi server/README.md)
├─ public/fonts/edwin/  # fontul Edwin (OFL)
├─ docker-compose.yml   # stack complet containerizat
├─ Dockerfile           # web (Vite → nginx)
├─ nginx.conf           # servire statică + proxy /api
└─ CLAUDE.md            # note de arhitectură / decizii
```

---

## Scurtături de tastatură

Apasă **H** în aplicație pentru lista completă. Pe scurt:

| Tastă | Acțiune |
|---|---|
| `N` | mod introducere note |
| `M` | mod versuri |
| `↑` / `↓` | transpune nota selectată |
| `←` / `→` | navighează între note |
| `Shift`+click / `Shift`+`←/→` | selecție pe interval |
| `Alt`+click | selecție individuală (toggle) |
| `Ctrl+C / X / V` | copy / cut / paste |
| `Ctrl+3` | triolet |
| `Space` | redare (preview) |
| `Ctrl+S` | salvare |
| `H` | ajutor |

---

## Testare și verificare

```bash
npm test       # Vitest (logică pură: notație, export MusicXML, reducer + undo/redo)
npm run build  # type-check strict + bundle
npm run lint   # ESLint
```

Toate cele trei trebuie să fie verzi. Randarea VexFlow și audio-ul se verifică
manual în browser.

---

## Limitări cunoscute / lucru viitor

Menționate în lucrare ca *future work* (neimplementate intenționat):

- Voci multiple pe același portativ.
- Schimbări de tonalitate/măsură la mijlocul piesei.
- Volte (finale 1/2) și repetiții imbricate; repetițiile **nu** se reflectă încă
  în exportul WAV/MusicXML (se exportă „ca scris").
- Note de ornament / appoggiatura.
- Pianul la export MusicXML = două părți separate (nu grand staff cu acoladă).

---

## Licență

Proiect academic (licență). Fontul **Edwin** este sub licență OFL
(vezi `public/fonts/edwin/LICENSE.txt`). Eșantioanele de instrumente provin de pe
CDN-ul extern `tonejs-instruments`.
