import "dotenv/config" // încarcă .env ÎNAINTE de modulele care citesc process.env
import express from "express"
import cors from "cors"
import authRoutes from "./routes/auth.js"
import scoreRoutes from "./routes/scores.js"
import shareRoutes from "./routes/shares.js"
import adminRoutes from "./routes/admin.js"
import { initDb } from "./store.js"

const app = express()
app.use(cors())
app.use(express.json({ limit: "8mb" })) // partiturile pot fi mari (multe note)

app.get("/api/health", (_req, res) => res.json({ ok: true }))
app.use("/api/auth", authRoutes)
app.use("/api/scores", scoreRoutes)
app.use("/api/shares", shareRoutes)
app.use("/api/admin", adminRoutes)

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
