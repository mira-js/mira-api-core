"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const hono_1 = require("hono");
const cors_1 = require("hono/cors");
const logger_1 = require("hono/logger");
const research_js_1 = require("./routes/research.js");
exports.app = new hono_1.Hono();
if (process.env.NODE_ENV !== 'test') {
    exports.app.use('*', (0, logger_1.logger)());
}
exports.app.use('*', (0, cors_1.cors)({
    origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
    credentials: true,
}));
exports.app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
exports.app.route('/api/v1/research', research_js_1.researchRoutes);
//# sourceMappingURL=app.js.map