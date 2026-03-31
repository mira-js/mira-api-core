"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorker = startWorker;
const bullmq_1 = require("bullmq");
const pipeline_js_1 = require("./services/pipeline.js");
const redis_js_1 = require("./services/redis.js");
function startWorker() {
    const worker = new bullmq_1.Worker('research', async (job) => {
        const result = await (0, pipeline_js_1.runPipeline)(job.data);
        if (!result.ok)
            throw result.error;
        return result.value;
    }, { connection: (0, redis_js_1.redisConnection)() });
    worker.on('completed', (job) => {
        console.log(`[worker] job ${job.id} completed`);
    });
    worker.on('failed', (job, err) => {
        console.error(`[worker] job ${job?.id} failed:`, err.message);
    });
}
//# sourceMappingURL=worker.js.map