import { Router } from "express"
import { listSharedWithUser, getSharedScore, deleteShare } from "../store.js"
import { authMiddleware } from "../auth.js"

const router = Router()
router.use(authMiddleware)

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err)
    res.status(500).json({ error: "Eroare server" })
  })

/** Partiturile partajate CU mine (listă: titlu + proprietar) */
router.get(
  "/",
  wrap(async (req, res) => {
    res.json({ shared: await listSharedWithUser(req.user.id) })
  }),
)

/**
 * Deschide o partitură partajată — FILTRATĂ la portativele permise (granularitatea
 * se aplică pe server, deci destinatarul nu primește deloc părțile ascunse).
 */
router.get(
  "/:shareId",
  wrap(async (req, res) => {
    const row = await getSharedScore(req.user.id, Number(req.params.shareId))
    if (!row) return res.status(404).json({ error: "Partajare inexistentă" })

    const data = row.data || {}
    const allowed = Array.isArray(row.staff_ids) ? row.staff_ids : []
    const staves = Array.isArray(data.staves) ? data.staves : []
    // [] = toată partitura; altfel doar portativele cu id în listă
    const filteredStaves = allowed.length > 0 ? staves.filter((st) => allowed.includes(st.id)) : staves

    res.json({
      shared: { title: row.title, owner: row.owner_email, data: { ...data, staves: filteredStaves } },
    })
  }),
)

/** Revocă o partajare (doar proprietarul ei o poate șterge) */
router.delete(
  "/:shareId",
  wrap(async (req, res) => {
    const ok = await deleteShare(req.user.id, Number(req.params.shareId))
    if (!ok) return res.status(404).json({ error: "Partajare inexistentă" })
    res.json({ ok: true })
  }),
)

export default router
