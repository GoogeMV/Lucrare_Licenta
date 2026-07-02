import { Router } from "express"
import Stripe from "stripe"
import { authMiddleware } from "../auth.js"
import { setUserPlan, getUserById } from "../store.js"

const router = Router()
router.use(authMiddleware)

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err)
    res.status(500).json({ error: "Eroare server" })
  })

// Stripe se inițializează doar dacă e configurat (chei în .env). Fără chei,
// rutele de plată întorc un mesaj clar în loc să crape serverul la pornire.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173"

/**
 * Pornește upgrade-ul la Pro. Dacă Stripe e configurat → întoarce URL-ul unei
 * sesiuni Stripe Checkout (mod test). Dacă NU → `{ mock: true }`, iar frontend-ul
 * afișează o pagină de plată SIMULATĂ (demo) — util fără cont Stripe.
 */
router.post(
  "/checkout",
  wrap(async (req, res) => {
    const user = await getUserById(req.user.id)
    if (user.plan === "pro") return res.status(400).json({ error: "Ai deja planul Pro." })

    if (!stripe) return res.json({ mock: true })

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: String(req.user.id),
      success_url: `${CLIENT_URL}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/?checkout=cancel`,
    })
    res.json({ url: session.url })
  }),
)

/**
 * Confirmare a plății SIMULATE (demo) — disponibilă DOAR când Stripe nu e
 * configurat. Trece utilizatorul pe Pro. (Cu Stripe activ, se folosește `/confirm`.)
 */
router.post(
  "/mock-confirm",
  wrap(async (req, res) => {
    if (stripe) return res.status(400).json({ error: "Plata reală e activă — folosește Stripe." })
    await setUserPlan(req.user.id, "pro")
    res.json({ plan: "pro" })
  }),
)

/**
 * Confirmă plata după revenirea de la Stripe: verifică pe server că sesiunea e
 * plătită ȘI aparține utilizatorului curent, apoi îl trece pe Pro. (Astfel nimeni
 * nu poate „pretinde" upgrade — verificarea se face direct la Stripe.)
 */
router.post(
  "/confirm",
  wrap(async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe nu e configurat — folosește plata simulată." })
    }
    const sessionId = String(req.body?.sessionId || "")
    if (!sessionId) return res.status(400).json({ error: "Lipsește sesiunea de plată" })

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== "paid") return res.status(402).json({ error: "Plata nu e confirmată" })
    if (session.client_reference_id !== String(req.user.id)) {
      return res.status(403).json({ error: "Sesiune de plată invalidă" })
    }

    await setUserPlan(req.user.id, "pro")
    res.json({ plan: "pro" })
  }),
)

export default router
