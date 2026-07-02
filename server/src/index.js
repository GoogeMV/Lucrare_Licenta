import "dotenv/config" // încarcă .env ÎNAINTE de modulele care citesc process.env
import express from "express"
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import authRoutes from "./routes/auth.js"
import scoreRoutes from "./routes/scores.js"
import shareRoutes from "./routes/shares.js"
import adminRoutes from "./routes/admin.js"
import billingRoutes from "./routes/billing.js"
import { initDb } from "./store.js"

const app = express()
// suntem în spatele unui reverse-proxy (nginx/Cloudflare) → ca rate-limit-ul să
// vadă IP-ul real al clientului (din X-Forwarded-For), nu pe cel al proxy-ului
app.set("trust proxy", 1)
app.use(helmet()) // security headers (anti-clickjacking, no-sniff etc.)
app.use(cors())
app.use(express.json({ limit: "8mb" })) // partiturile pot fi mari (multe note)

// limitează încercările de autentificare (anti brute-force / credential stuffing):
// max 30 de cereri / 10 min / IP pe rutele de login & înregistrare
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Prea multe încercări. Reîncearcă peste câteva minute." },
})

app.get("/api/health", (_req, res) => res.json({ ok: true }))
app.use("/api/auth", authLimiter, authRoutes)
app.use("/api/scores", scoreRoutes)
app.use("/api/shares", shareRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/billing", billingRoutes)

const PORT = process.env.PORT || 4000

// creăm tabelele (dacă lipsesc) înainte de a accepta cereri
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`NotationSoft server pornit pe http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error("Nu m-am putut conecta la PostgreSQL (verifică DATABASE_URL):", err.message)
    process.exit(1)
  })
