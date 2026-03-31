"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
exports.closePool = closePool;
const pg_1 = require("pg");
let pool = null;
function getPool() {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable is not set');
        }
        pool = new pg_1.Pool({ connectionString });
    }
    return pool;
}
async function query(text, params) {
    try {
        const result = await getPool().query(text, params);
        return { ok: true, value: result.rows };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
}
function closePool() {
    if (!pool)
        return Promise.resolve();
    const p = pool;
    pool = null;
    return p.end();
}
//# sourceMappingURL=db.js.map