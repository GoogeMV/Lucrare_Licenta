import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

// În producție secretul e OBLIGATORIU — altfel tokenele ar fi semnate cu o valoare
// cunoscută public (oricine ar putea forja sesiuni). În dev permitem un fallback,
// dar avertizăm zgomotos.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET lipsește — setează-l în .env înainte de a porni în producție")
  }
  console.warn("⚠ JWT_SECRET nesetat — folosesc un secret de DEV (NU pentru producție)")
}
const SECRET = process.env.JWT_SECRET || "dev-secret-schimba-ma"
const TOKEN_TTL = "30d"

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash)
}

export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: TOKEN_TTL })
}

/** Middleware: cere un token JWT valid în antetul `Authorization: Bearer …` */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: "Neautentificat" })
  try {
    req.user = jwt.verify(token, SECRET)
    next()
  } catch {
    res.status(401).json({ error: "Sesiune expirată sau token invalid" })
  }
}
