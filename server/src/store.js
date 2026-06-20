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
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- pentru baze existente create înainte de coloana is_admin
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS shares (
      id SERIAL PRIMARY KEY,
      score_id INTEGER NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shared_with_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      -- portativele (id-uri) vizibile destinatarului; [] = toată partitura
      staff_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      can_edit BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (score_id, shared_with_id)
    );
  `)
}

// --- utilizatori ---
export async function getUserByEmail(email) {
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email])
  return rows[0] ?? null
}
export async function getUserById(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id])
  return rows[0] ?? null
}
export async function createUser(email, passwordHash) {
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
    [email, passwordHash],
  )
  return rows[0]
}
export async function updateUserEmail(id, email) {
  const { rows } = await pool.query(
    "UPDATE users SET email = $1 WHERE id = $2 RETURNING id, email",
    [email, id],
  )
  return rows[0]
}
export async function updateUserPassword(id, passwordHash) {
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id])
}
export async function deleteUser(id) {
  // partiturile dispar prin ON DELETE CASCADE
  await pool.query("DELETE FROM users WHERE id = $1", [id])
}
export async function setUserAdmin(id, value) {
  await pool.query("UPDATE users SET is_admin = $1 WHERE id = $2", [value, id])
}
export async function listAdmins() {
  const { rows } = await pool.query("SELECT id, email FROM users WHERE is_admin = true ORDER BY id")
  return rows
}

// --- administrare / statistici ---
export async function getStats() {
  const count = (sql) => pool.query(sql).then((r) => Number(r.rows[0].count))
  return {
    users: await count("SELECT COUNT(*) FROM users"),
    scores: await count("SELECT COUNT(*) FROM scores"),
    shares: await count("SELECT COUNT(*) FROM shares"),
    newUsers7d: await count("SELECT COUNT(*) FROM users WHERE created_at > now() - interval '7 days'"),
    newScores7d: await count("SELECT COUNT(*) FROM scores WHERE created_at > now() - interval '7 days'"),
  }
}
/** Toți utilizatorii cu numărul lor de partituri (pentru panoul de admin) */
export async function listUsersWithCounts() {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.is_admin, u.created_at, COUNT(s.id)::int AS score_count
       FROM users u LEFT JOIN scores s ON s.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC`,
  )
  return rows
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

// --- partajări (sharing granular) ---
/** Creează sau actualizează o partajare (un destinatar per partitură) */
export async function createOrUpdateShare(scoreId, ownerId, sharedWithId, staffIds) {
  const { rows } = await pool.query(
    `INSERT INTO shares (score_id, owner_id, shared_with_id, staff_ids)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (score_id, shared_with_id)
     DO UPDATE SET staff_ids = EXCLUDED.staff_ids
     RETURNING id`,
    [scoreId, ownerId, sharedWithId, JSON.stringify(staffIds)],
  )
  return rows[0]
}
/** Cu cine e partajată o partitură a proprietarului (cu emailul destinatarului) */
export async function listSharesForScore(ownerId, scoreId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.staff_ids, u.email AS shared_with_email
       FROM shares s JOIN users u ON u.id = s.shared_with_id
      WHERE s.score_id = $1 AND s.owner_id = $2
      ORDER BY s.created_at DESC`,
    [scoreId, ownerId],
  )
  return rows
}
/** Revocă o partajare (doar proprietarul ei) */
export async function deleteShare(ownerId, shareId) {
  const { rowCount } = await pool.query("DELETE FROM shares WHERE id = $1 AND owner_id = $2", [shareId, ownerId])
  return rowCount > 0
}
/** Partiturile partajate CU acest utilizator (cu emailul proprietarului) */
export async function listSharedWithUser(userId) {
  const { rows } = await pool.query(
    `SELECT s.id AS share_id, sc.title, sc.updated_at, u.email AS owner_email
       FROM shares s
       JOIN scores sc ON sc.id = s.score_id
       JOIN users u ON u.id = s.owner_id
      WHERE s.shared_with_id = $1
      ORDER BY sc.updated_at DESC`,
    [userId],
  )
  return rows
}
/** O partitură partajată (pentru destinatar) — cu lista de portative permise */
export async function getSharedScore(userId, shareId) {
  const { rows } = await pool.query(
    `SELECT s.staff_ids, sc.title, sc.data, u.email AS owner_email
       FROM shares s
       JOIN scores sc ON sc.id = s.score_id
       JOIN users u ON u.id = s.owner_id
      WHERE s.id = $1 AND s.shared_with_id = $2`,
    [shareId, userId],
  )
  return rows[0] ?? null
}
