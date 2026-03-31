"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.researchRoutes = void 0;
const hono_1 = require("hono");
const zod_1 = require("zod");
const shared_core_1 = require("@mia/shared-core");
const orchestrator_js_1 = require("../services/orchestrator.js");
const ResearchJobInputSchema = zod_1.z.object({
    query: zod_1.z.string({ required_error: 'query is required' }).min(1, 'query is required'),
    sources: zod_1.z.array(shared_core_1.SourceSchema).optional(),
    depth: zod_1.z.enum(['quick', 'deep']).optional(),
});
exports.researchRoutes = new hono_1.Hono();
// POST /api/v1/research — enqueue a new research job
exports.researchRoutes.post('/', async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const parsed = ResearchJobInputSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
    }
    const input = parsed.data;
    try {
        const job = await orchestrator_js_1.orchestrator.enqueue(input);
        return c.json({ jobId: job.id, status: 'queued' }, 202);
    }
    catch {
        return c.json({ error: 'Queue unavailable' }, 503);
    }
});
// GET /api/v1/research/:jobId — get job status and result
exports.researchRoutes.get('/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    try {
        const job = await orchestrator_js_1.orchestrator.getJob(jobId);
        if (!job)
            return c.json({ error: 'Not found' }, 404);
        return c.json(job);
    }
    catch {
        return c.json({ error: 'Queue unavailable' }, 503);
    }
});
// GET /api/v1/research — list jobs
exports.researchRoutes.get('/', async (c) => {
    try {
        const jobs = await orchestrator_js_1.orchestrator.listJobs();
        return c.json(jobs);
    }
    catch {
        return c.json({ error: 'Queue unavailable' }, 503);
    }
});
//# sourceMappingURL=research.js.map