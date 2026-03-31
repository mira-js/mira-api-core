import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from 'pg'

const MIGRATIONS_DIR = join(__dirname, '../../migrations')

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const pool = new Pool({ connectionString })

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const applied = await pool
      .query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename')
      .then((r) => new Set(r.rows.map((row) => row.filename)))

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      if (applied.has(file)) continue
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      console.log(`[migrate] applying ${file}`)
      await pool.query(sql)
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
      console.log(`[migrate] applied ${file}`)
    }

    console.log('[migrate] done')
  } finally {
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('[migrate] failed:', err)
  process.exit(1)
})
