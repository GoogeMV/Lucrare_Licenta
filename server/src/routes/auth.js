import { Router } from "express"
import {
  getUserByEmail,
  getUserById,
  createUser,
  updateUserEmail,
  updateUserPassword,
  deleteUser,
} from "../store.js"
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

/** Datele contului curent: validează tokenul ȘI verifică în DB că mai există
 *  (un token de cont șters/cu email schimbat ar fi altfel acceptat orbește) */
router.get(
  "/me",
  authMiddleware,
  wrap(async (req, res) => {
    const user = await getUserById(req.user.id)
    if (!user) return res.status(401).json({ error: "Cont inexistent" })
    res.json({ user: { id: user.id, email: user.email } })
  }),
)

/**
 * Actualizează contul curent: email și/sau parolă. Cere ÎNTOTDEAUNA parola
 * curentă (confirmare). Reemite tokenul, fiindcă emailul e în payload-ul JWT.
 */
router.put(
  "/me",
  authMiddleware,
  wrap(async (req, res) => {
    const user = await getUserById(req.user.id)
    if (!user) return res.status(404).json({ error: "Cont inexistent" })

    const currentPassword = String(req.body?.currentPassword || "")
    if (!verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: "Parola curentă e greșită" })
    }

    let email = user.email
    // schimbare email (dacă e furnizat și diferit)
    if (req.body?.email !== undefined) {
      const newEmail = String(req.body.email).trim().toLowerCase()
      if (!newEmail || !newEmail.includes("@")) return res.status(400).json({ error: "Email invalid" })
      if (newEmail !== user.email) {
        if (await getUserByEmail(newEmail)) {
          return res.status(409).json({ error: "Există deja un cont cu acest email" })
        }
        const updated = await updateUserEmail(user.id, newEmail)
        email = updated.email
      }
    }

    // schimbare parolă (dacă e furnizată una nouă, nevidă)
    const newPassword = String(req.body?.newPassword || "")
    if (newPassword.length > 0) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Parola nouă trebuie să aibă cel puțin 6 caractere" })
      }
      await updateUserPassword(user.id, hashPassword(newPassword))
    }

    const fresh = { id: user.id, email }
    res.json({ token: signToken(fresh), user: fresh })
  }),
)

/** Șterge contul curent (și toate partiturile, prin ON DELETE CASCADE). Cere parola. */
router.delete(
  "/me",
  authMiddleware,
  wrap(async (req, res) => {
    const user = await getUserById(req.user.id)
    if (!user) return res.status(404).json({ error: "Cont inexistent" })

    const password = String(req.body?.password || "")
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Parolă greșită" })
    }

    await deleteUser(user.id)
    res.json({ ok: true })
  }),
)

export default router
