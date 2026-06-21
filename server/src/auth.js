import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

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
