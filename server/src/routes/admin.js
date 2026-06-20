import { Router } from "express"
import { authMiddleware } from "../auth.js"
import { getUserById, getStats, listUsersWithCounts, deleteUser } from "../store.js"

const router = Router()

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err)
    res.status(500).json({ error: "Eroare server" })
  })

/** Cere autentificare ȘI rol de admin (is_admin în baza de date). Middleware cu
 *  3 argumente (NU prin `wrap`, care nu pasează `next`). */
async function requireAdmin(req, res, next) {
  try {
    const user = await getUserById(req.user.id)
    if (!user || !user.is_admin) return res.status(403).json({ error: "Acces interzis" })
    next()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Eroare server" })
  }
}

router.use(authMiddleware, requireAdmin)

/** Statistici de utilizare (totaluri + activitate recentă) */
router.get(
  "/stats",
  wrap(async (_req, res) => {
    res.json({ stats: await getStats() })
  }),
)

/** Toți utilizatorii cu numărul lor de partituri */
router.get(
  "/users",
  wrap(async (_req, res) => {
    res.json({ users: await listUsersWithCounts() })
  }),
)

/**
 * Șterge un utilizator (moderare). Restricții: nu pe tine însuți (folosește Setări
 * cont) și nu un alt ADMIN (retrogradează-l întâi cu `npm run admin -- set … off`).
 * Așa adminii nu se pot șterge reciproc prin API.
 */
router.delete(
  "/users/:id",
  wrap(async (req, res) => {
    const id = Number(req.params.id)
    if (id === req.user.id) return res.status(400).json({ error: "Nu te poți șterge din panoul de admin" })
    const target = await getUserById(id)
    if (!target) return res.status(404).json({ error: "Utilizatorul nu există" })
    if (target.is_admin) {
      return res.status(403).json({ error: "Nu poți șterge un alt administrator (retrogradează-l întâi din script)" })
    }
    await deleteUser(id)
    res.json({ ok: true })
  }),
)

export default router
