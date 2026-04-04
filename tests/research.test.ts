import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CoreSource } from '@mira/shared-core'

vi.mock('../src/services/orchestrator.js', () => ({
  orchestrator: {
    enqueue: vi.fn().mockResolvedValue({ id: 'job-abc' }),
    getJob: vi.fn(),
    listJobs: vi.fn().mockResolvedValue([]),
  },
}))

import { orchestrator } from '../src/services/orchestrator.js'
import { app } from '../src/app.js'

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.fetch(new Request('http://localhost/health'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })
})

describe('POST /api/v1/research', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 202 and jobId on valid request', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'invoice pain points' }),
      }),
    )
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBe('job-abc')
    expect(body.status).toBe('queued')
  })

  it('returns 400 when query is missing', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/query/)
  })

  it('returns 400 on invalid JSON body', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid json/i)
  })

  it('accepts optional sources and depth', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test',
          sources: ['reddit', 'hackernews'],
          depth: 'deep',
        }),
      }),
    )
    expect(res.status).toBe(202)
    expect(orchestrator.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'test',
        sources: [CoreSource.reddit, CoreSource.hackernews],
        depth: 'deep',
      }),
    )
  })

  it('returns 503 when the queue is unavailable', async () => {
    vi.mocked(orchestrator.enqueue).mockRejectedValueOnce(new Error('Redis down'))

    const res = await app.fetch(
      new Request('http://localhost/api/v1/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test' }),
      }),
    )

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatch(/queue unavailable/i)
  })
})

describe('GET /api/v1/research/:jobId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 for unknown jobId', async () => {
    vi.mocked(orchestrator.getJob).mockResolvedValueOnce(null)
    const res = await app.fetch(new Request('http://localhost/api/v1/research/unknown-id'))
    expect(res.status).toBe(404)
  })

  it('returns 503 when the queue is unavailable', async () => {
    vi.mocked(orchestrator.getJob).mockRejectedValueOnce(new Error('Redis down'))
    const res = await app.fetch(new Request('http://localhost/api/v1/research/job-abc'))
    expect(res.status).toBe(503)
  })

  it('returns job data when found', async () => {
    vi.mocked(orchestrator.getJob).mockResolvedValueOnce({
      jobId: 'job-abc',
      status: 'completed',
      query: 'invoice pain points',
      sources: undefined,
      depth: undefined,
      createdAt: '2024-01-01T00:00:00Z',
      result: {
        query: 'invoice pain points',
        summary: '',
        painPoints: [],
        competitorWeaknesses: [],
        emergingGaps: [],
        rawItems: [],
      },
    })
    const res = await app.fetch(new Request('http://localhost/api/v1/research/job-abc'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.jobId).toBe('job-abc')
    expect(body.status).toBe('completed')
  })
})

describe('GET /api/v1/research', () => {
  it('returns an array', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/research'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 503 when the queue is unavailable', async () => {
    vi.mocked(orchestrator.listJobs).mockRejectedValueOnce(new Error('Redis down'))
    const res = await app.fetch(new Request('http://localhost/api/v1/research'))
    expect(res.status).toBe(503)
  })
})
