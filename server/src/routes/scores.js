import { Router } from "express"
import {
  listScores,
  getScore,
  createScore,
  updateScore,
  deleteScore,
  getUserById,
  getUserByEmail,
  countScores,
  createOrUpdateShare,
  listSharesForScore,
} from "../store.js"
import { authMiddleware } from "../auth.js"

// limita planului gratuit pentru partituri salvate în cont (Pro = nelimitat)
const FREE_SCORE_LIMIT = 3

const router = Router()
router.use(authMiddleware) // toate rutele de mai jos cer autentificare

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err)
    res.status(500).json({ error: "Eroare server" })
  })

/** Lista partiturilor utilizatorului (fără conținut, doar metadate) */
router.get(
  "/",
  wrap(async (req, res) => {
    res.json({ scores: await listScores(req.user.id) })
  }),
)

/** O partitură completă (cu conținut) */
router.get(
  "/:id",
  wrap(async (req, res) => {
    const score = await getScore(req.user.id, Number(req.params.id))
    if (!score) return res.status(404).json({ error: "Partitura nu există" })
    res.json({ score: { id: score.id, title: score.title, updated_at: score.updated_at, data: score.data } })
  }),
)

/** Creează o partitură nouă (gratuit: max FREE_SCORE_LIMIT; Pro: nelimitat) */
router.post(
  "/",
  wrap(async (req, res) => {
    const data = req.body?.data
    if (!data) return res.status(400).json({ error: "Lipsește conținutul partiturii" })
    const user = await getUserById(req.user.id)
    if (user.plan !== "pro" && (await countScores(req.user.id)) >= FREE_SCORE_LIMIT) {
      return res.status(402).json({
        error: `Planul gratuit permite maximum ${FREE_SCORE_LIMIT} partituri în cont. Treci la Pro pentru nelimitat.`,
      })
    }
    const score = await createScore(req.user.id, String(req.body?.title || "Partitură fără titlu"), data)
    res.json({ id: score.id })
  }),
)

/** Actualizează o partitură existentă (doar a utilizatorului) */
router.put(
  "/:id",
  wrap(async (req, res) => {
    const data = req.body?.data
    if (!data) return res.status(400).json({ error: "Lipsește conținutul partiturii" })
    const ok = await updateScore(
      req.user.id,
      Number(req.params.id),
      String(req.body?.title || "Partitură fără titlu"),
      data,
    )
    if (!ok) return res.status(404).json({ error: "Partitura nu există" })
    res.json({ ok: true })
  }),
)

/** Șterge o partitură */
router.delete(
  "/:id",
  wrap(async (req, res) => {
    await deleteScore(req.user.id, Number(req.params.id))
    res.json({ ok: true })
  }),
)

/** Partajează partitura :id cu un utilizator (după email), cu portativele alese.
 *  Partajarea granulară e o funcție Pro. */
router.post(
  "/:id/shares",
  wrap(async (req, res) => {
    const owner = await getUserById(req.user.id)
    if (owner.plan !== "pro") {
      return res.status(402).json({ error: "Partajarea e disponibilă în planul Pro." })
    }
    const scoreId = Number(req.params.id)
    const score = await getScore(req.user.id, scoreId)
    if (!score) return res.status(404).json({ error: "Partitura nu există" })

    const email = String(req.body?.email || "").trim().toLowerCase()
    const recipient = await getUserByEmail(email)
    if (!recipient) return res.status(404).json({ error: "Nu există un cont cu acest email" })
    if (recipient.id === req.user.id) return res.status(400).json({ error: "Nu poți partaja cu tine însuți" })

    const staffIds = Array.isArray(req.body?.staffIds) ? req.body.staffIds.map(String) : []
    const share = await createOrUpdateShare(scoreId, req.user.id, recipient.id, staffIds)
    res.json({ id: share.id })
  }),
)

/** Cu cine e partajată partitura :id (pentru gestionare/revocare) */
router.get(
  "/:id/shares",
  wrap(async (req, res) => {
    const scoreId = Number(req.params.id)
    const score = await getScore(req.user.id, scoreId)
    if (!score) return res.status(404).json({ error: "Partitura nu există" })
    res.json({ shares: await listSharesForScore(req.user.id, scoreId) })
  }),
)

export default router
