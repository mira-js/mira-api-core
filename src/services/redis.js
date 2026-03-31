"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = redisConnection;
function redisConnection() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
        maxRetriesPerRequest: null,
    };
}
//# sourceMappingURL=redis.js.map