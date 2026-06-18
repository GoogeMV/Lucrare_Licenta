import { Router } from "express"
import { getUserByEmail, createUser } from "../store.js"
import { hashPassword, verifyPassword, signToken, authMiddleware } from "../auth.js"

const router = Router()

/** Prinde erorile din handler-ele async și întoarce 500 (Express 4 nu o face singur) */
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err)
    res.status(500).json({ error: "Eroare server" })
  })

/** Înregistrare cont nou (email + parolă) */
router.post(
  "/register",
  wrap(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase()
    const password = String(req.body?.password || "")
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Email invalid" })
    if (password.length < 6) return res.status(400).json({ error: "Parola trebuie să aibă cel puțin 6 caractere" })

    if (await getUserByEmail(email)) return res.status(409).json({ error: "Există deja un cont cu acest email" })

    const user = await createUser(email, hashPassword(password))
    res.json({ token: signToken(user), user: { id: user.id, email: user.email } })
  }),
)

/** Autentificare */
router.post(
  "/login",
  wrap(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase()
    const password = String(req.body?.password || "")
    const user = await getUserByEmail(email)
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Email sau parolă greșite" })
    }
    res.json({ token: signToken(user), user: { id: user.id, email: user.email } })
  }),
)

/** Datele contului curent (validează tokenul) */
router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } })
})

export default router
