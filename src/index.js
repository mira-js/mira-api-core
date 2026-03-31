"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_server_1 = require("@hono/node-server");
const app_js_1 = require("./app.js");
const worker_js_1 = require("./worker.js");
const port = Number(process.env.PORT) || 3000;
(0, worker_js_1.startWorker)();
(0, node_server_1.serve)({ fetch: app_js_1.app.fetch, port }, () => console.log(`MIA running on http://localhost:${port}`));
//# sourceMappingURL=index.js.map