# NotationSoft — backend

API Node (Express) pentru autentificare și partituri în cloud. Stocare în
**PostgreSQL** (pachetul `pg`, pur-JS — fără build native). Tabelele se creează
automat la pornire (`initDb`). Partiturile sunt stocate într-o coloană `JSONB`.

## Pregătire bază de date

Instalează PostgreSQL și creează o bază (o singură dată):

```bash
createdb notationsoft
# sau în psql:  CREATE DATABASE notationsoft;
```

## Rulare

```bash
cd server
npm install
cp .env.example .env   # (Windows: copy .env.example .env)
# editează .env: schimbă JWT_SECRET și pune DATABASE_URL corect
npm run dev            # node --watch src/index.js  → http://localhost:4000
```

`DATABASE_URL` are forma `postgresql://utilizator:parolă@localhost:5432/notationsoft`.
La prima pornire se creează tabelele `users`, `scores` și `shares`.

**Admin** (panou de statistici + utilizatori) — rolul `is_admin` se setează MANUAL,
pe server, niciodată prin API (fără cale de escaladare). Contul trebuie să existe deja:

```bash
npm run admin -- set eu@example.com on    # promovează
npm run admin -- set eu@example.com off   # retrogradează
npm run admin -- list                     # listează adminii
```

Frontend-ul (Vite) proxează automat `/api` către `http://localhost:4000`
(vezi `vite.config.ts`). Pornește ambele în terminale separate:

```bash
npm run dev            # în rădăcină — frontend pe :5173
cd server && npm run dev   # backend pe :4000
```

## Endpointuri

| Metodă | Rută | Auth | Descriere |
|---|---|---|---|
| POST | `/api/auth/register` | — | înregistrare (email + parolă ≥6) → `{token, user}` |
| POST | `/api/auth/login` | — | autentificare → `{token, user}` |
| GET | `/api/auth/me` | ✓ | contul curent (validează tokenul) |
| GET | `/api/scores` | ✓ | lista partiturilor (id, titlu, dată) |
| GET | `/api/scores/:id` | ✓ | o partitură cu conținut |
| POST | `/api/scores` | ✓ | salvează o partitură nouă |
| PUT | `/api/scores/:id` | ✓ | actualizează |
| DELETE | `/api/scores/:id` | ✓ | șterge |

Autentificarea folosește JWT (`Authorization: Bearer <token>`); parolele sunt
stocate hash-uite cu bcrypt. `data.json` și `.env` sunt în `.gitignore`.
