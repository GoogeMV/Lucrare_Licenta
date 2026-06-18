import pg from "pg"

/**
 * Stocare în PostgreSQL (pachetul `pg`, pur-JS, fără build native). Conexiunea
 * vine din `DATABASE_URL` (.env). `initDb()` creează tabelele dacă lipsesc.
 * Coloana `data` e JSONB — pg întoarce automat un obiect JS la citire; la scriere
 * trimitem JSON.stringify, iar Postgres îl parsează în jsonb.
 */
const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}

// --- utilizatori ---
export async function getUserByEmail(email) {
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email])
  return rows[0] ?? null
}
export async function createUser(email, passwordHash) {
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
    [email, passwordHash],
  )
  return rows[0]
}

// --- partituri ---
export async function listScores(userId) {
  const { rows } = await pool.query(
    "SELECT id, title, updated_at FROM scores WHERE user_id = $1 ORDER BY updated_at DESC",
    [userId],
  )
  return rows
}
export async function getScore(userId, id) {
  const { rows } = await pool.query(
    "SELECT id, title, data, updated_at FROM scores WHERE id = $1 AND user_id = $2",
    [id, userId],
  )
  return rows[0] ?? null
}
export async function createScore(userId, title, data) {
  const { rows } = await pool.query(
    "INSERT INTO scores (user_id, title, data) VALUES ($1, $2, $3) RETURNING id",
    [userId, title, JSON.stringify(data)],
  )
  return rows[0]
}
export async function updateScore(userId, id, title, data) {
  const { rowCount } = await pool.query(
    "UPDATE scores SET title = $1, data = $2, updated_at = now() WHERE id = $3 AND user_id = $4",
    [title, JSON.stringify(data), id, userId],
  )
  return rowCount > 0
}
export async function deleteScore(userId, id) {
  await pool.query("DELETE FROM scores WHERE id = $1 AND user_id = $2", [id, userId])
}
