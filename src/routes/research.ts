import { Hono } from 'hono'
import { z } from 'zod'
import { SourceSchema, type ResearchJobInput } from '@mira/shared-core'
import { orchestrator } from '../services/orchestrator.js'
import type { AppEnv } from '../types.js'

const ResearchJobInputSchema = z.object({
  query: z.string({ required_error: 'query is required' }).min(1, 'query is required'),
  sources: z.array(SourceSchema).optional(),
  depth: z.enum(['quick', 'deep']).optional(),
})

export const researchRoutes = new Hono<AppEnv>()

// POST /api/v1/research — enqueue a new research job
researchRoutes.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = ResearchJobInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }

  const input: ResearchJobInput = parsed.data

  try {
    const job = await orchestrator.enqueue(input)
    return c.json({ jobId: job.id, status: 'queued' }, 202)
  } catch {
    return c.json({ error: 'Queue unavailable' }, 503)
  }
})

// GET /api/v1/research/:jobId — get job status and result
researchRoutes.get('/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  try {
    const job = await orchestrator.getJob(jobId)
    if (!job) return c.json({ error: 'Not found' }, 404)
    return c.json(job)
  } catch {
    return c.json({ error: 'Queue unavailable' }, 503)
  }
})

// GET /api/v1/research — list jobs
researchRoutes.get('/', async (c) => {
  try {
    const jobs = await orchestrator.listJobs()
    return c.json(jobs)
  } catch {
    return c.json({ error: 'Queue unavailable' }, 503)
  }
})
