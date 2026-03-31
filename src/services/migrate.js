"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const pg_1 = require("pg");
const MIGRATIONS_DIR = (0, node_path_1.join)(__dirname, '../../migrations');
async function migrate() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
        throw new Error('DATABASE_URL is not set');
    const pool = new pg_1.Pool({ connectionString });
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
        const applied = await pool
            .query('SELECT filename FROM schema_migrations ORDER BY filename')
            .then((r) => new Set(r.rows.map((row) => row.filename)));
        const files = (0, node_fs_1.readdirSync)(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        for (const file of files) {
            if (applied.has(file))
                continue;
            const sql = (0, node_fs_1.readFileSync)((0, node_path_1.join)(MIGRATIONS_DIR, file), 'utf8');
            console.log(`[migrate] applying ${file}`);
            await pool.query(sql);
            await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
            console.log(`[migrate] applied ${file}`);
        }
        console.log('[migrate] done');
    }
    finally {
        await pool.end();
    }
}
migrate().catch((err) => {
    console.error('[migrate] failed:', err);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map