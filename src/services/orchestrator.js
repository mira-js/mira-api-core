"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrator = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");
const connection = new ioredis_1.Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});
const researchQueue = new bullmq_1.Queue('research', { connection });
function toJobStatus(state) {
    switch (state) {
        case 'active': return 'active';
        case 'completed': return 'completed';
        case 'failed': return 'failed';
        default: return 'queued';
    }
}
exports.orchestrator = {
    async enqueue(input) {
        const job = await researchQueue.add('research', input, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
        });
        if (!job.id)
            throw new Error('BullMQ returned a job without an ID');
        return { id: job.id };
    },
    async getJob(jobId) {
        const job = await researchQueue.getJob(jobId);
        if (!job)
            return null;
        return {
            jobId: String(job.id),
            status: toJobStatus(await job.getState()),
            query: job.data.query,
            sources: job.data.sources,
            depth: job.data.depth,
            createdAt: new Date(job.timestamp).toISOString(),
            result: job.returnvalue ?? undefined,
        };
    },
    async listJobs() {
        const jobs = await researchQueue.getJobs(['active', 'waiting', 'delayed', 'completed', 'failed']);
        return Promise.all(jobs.map(async (job) => ({
            jobId: String(job.id),
            query: job.data.query,
            status: toJobStatus(await job.getState()),
        })));
    },
};
//# sourceMappingURL=orchestrator.js.map