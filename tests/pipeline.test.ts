import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CoreSource,
  type CollectedItem,
  type ExtractionResult,
  type PainPointTheme,
} from '@mira/shared-core'

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({ on: vi.fn(), quit: vi.fn() })),
  Redis: vi.fn().mockImplementation(() => ({ on: vi.fn(), quit: vi.fn() })),
}))

vi.mock('@mira/core-collectors', () => ({
  collectReddit: vi.fn(),
  collectHackerNews: vi.fn(),
  collectNewsRSS: vi.fn(),
}))

vi.mock('../src/services/openviking.js', () => ({
  openVikingClient: {
    addResource: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../src/services/analysis.js', () => ({
  extractItem: vi.fn(),
  aggregateThemes: vi.fn(),
  synthesizeReport: vi.fn(),
}))

import { collectReddit, collectHackerNews, collectNewsRSS } from '@mira/core-collectors'
import { openVikingClient } from '../src/services/openviking.js'
import { extractItem, aggregateThemes, synthesizeReport } from '../src/services/analysis.js'
import { runPipeline } from '../src/services/pipeline.js'

const mockItem: CollectedItem = {
  source: CoreSource.hackernews,
  url: 'https://news.ycombinator.com/item?id=1',
  title: 'Invoicing pain',
  body: 'Details here.',
  author: 'hnuser',
  timestamp: '2024-01-01T00:00:00Z',
  engagement: { upvotes: 5, comments: 1 },
  raw_replies: [],
}

const mockExtraction: ExtractionResult = {
  pain_points: ['crashes on send'],
  sentiment: 'negative',
  category: 'complaint',
  mentioned_tools: [],
  key_quote: 'crashes on send',
}

const mockTheme: PainPointTheme = {
  theme: 'crashes on send',
  frequency: 1,
  sources: [CoreSource.hackernews],
  sentiment: -1,
  evidence: [
    {
      source: CoreSource.hackernews,
      url: 'https://news.ycombinator.com/item?id=1',
      excerpt: 'crashes on send',
    },
  ],
}

describe('runPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(collectReddit).mockResolvedValue([])
    vi.mocked(collectHackerNews).mockResolvedValue([])
    vi.mocked(collectNewsRSS).mockResolvedValue([])
    vi.mocked(extractItem).mockResolvedValue({ ok: true, value: mockExtraction })
    vi.mocked(aggregateThemes).mockResolvedValue({ ok: true, value: [] })
    vi.mocked(synthesizeReport).mockResolvedValue({ ok: true, value: 'Report summary.' })
  })

  it('happy path — returns ok: true with ResearchResult', async () => {
    vi.mocked(collectHackerNews).mockResolvedValue([mockItem])
    vi.mocked(aggregateThemes).mockResolvedValue({ ok: true, value: [mockTheme] })

    const result = await runPipeline({
      query: 'invoice pain',
      sources: [CoreSource.reddit, CoreSource.hackernews, CoreSource.news],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.query).toBe('invoice pain')
    expect(result.value.summary).toBe('Report summary.')
    expect(result.value.rawItems).toHaveLength(1)
  })

  it('one collector fails — continues with items from successful collectors', async () => {
    vi.mocked(collectReddit).mockRejectedValue(new Error('Reddit down'))
    vi.mocked(collectHackerNews).mockResolvedValue([mockItem])

    const result = await runPipeline({
      query: 'invoice',
      sources: [CoreSource.reddit, CoreSource.hackernews, CoreSource.news],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rawItems).toHaveLength(1)
  })

  it('all collectors fail — returns ok: true with empty rawItems', async () => {
    vi.mocked(collectReddit).mockRejectedValue(new Error('down'))
    vi.mocked(collectHackerNews).mockRejectedValue(new Error('down'))
    vi.mocked(collectNewsRSS).mockRejectedValue(new Error('down'))

    const result = await runPipeline({
      query: 'invoice',
      sources: [CoreSource.reddit, CoreSource.hackernews, CoreSource.news],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rawItems).toHaveLength(0)
    expect(extractItem).not.toHaveBeenCalled()
  })

  it('synthesize failure propagates as ok: false', async () => {
    vi.mocked(collectHackerNews).mockResolvedValue([mockItem])
    vi.mocked(synthesizeReport).mockResolvedValue({ ok: false, error: new Error('LLM down') })

    const result = await runPipeline({ query: 'invoice' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('LLM down')
  })

  it('uses default sources when none specified', async () => {
    await runPipeline({ query: 'test' })

    expect(collectReddit).toHaveBeenCalled()
    expect(collectHackerNews).toHaveBeenCalled()
    expect(collectNewsRSS).toHaveBeenCalled()
  })

  it('openviking failure does not block result', async () => {
    vi.mocked(collectHackerNews).mockResolvedValue([mockItem])
    vi.mocked(openVikingClient.addResource).mockRejectedValue(new Error('Viking offline'))

    const result = await runPipeline({ query: 'test' })

    expect(result.ok).toBe(true)
  })

  it('depth: deep calls collectReddit with limit 50 and collectHackerNews with limit 40', async () => {
    await runPipeline({
      query: 'test',
      depth: 'deep',
      sources: [CoreSource.reddit, CoreSource.hackernews],
    })

    expect(vi.mocked(collectReddit)).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    )
    expect(vi.mocked(collectHackerNews)).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 40 }),
    )
  })

  it('depth: quick calls collectReddit with limit 25 and collectHackerNews with limit 20', async () => {
    await runPipeline({
      query: 'test',
      depth: 'quick',
      sources: [CoreSource.reddit, CoreSource.hackernews],
    })

    expect(vi.mocked(collectReddit)).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    )
    expect(vi.mocked(collectHackerNews)).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    )
  })

  describe('Jina full-text enrichment', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      delete process.env.MIRA_ENABLE_FULLTEXT
    })

    it('depth: deep with MIRA_ENABLE_FULLTEXT=true calls fetch with Jina URL', async () => {
      process.env.MIRA_ENABLE_FULLTEXT = 'true'
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => 'enriched content' })
      vi.stubGlobal('fetch', mockFetch)

      vi.mocked(collectHackerNews).mockResolvedValue([mockItem])

      await runPipeline({ query: 'test', depth: 'deep', sources: [CoreSource.hackernews] })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://r.jina.ai/${mockItem.url}`,
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'text/markdown' }),
        }),
      )
    })

    it('depth: quick with MIRA_ENABLE_FULLTEXT=true does NOT call fetch', async () => {
      process.env.MIRA_ENABLE_FULLTEXT = 'true'
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      vi.mocked(collectHackerNews).mockResolvedValue([mockItem])

      await runPipeline({ query: 'test', depth: 'quick', sources: [CoreSource.hackernews] })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('item with empty url is skipped — fetch is not called for it', async () => {
      process.env.MIRA_ENABLE_FULLTEXT = 'true'
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => 'enriched' })
      vi.stubGlobal('fetch', mockFetch)

      const itemNoUrl: CollectedItem = { ...mockItem, url: '' }
      vi.mocked(collectHackerNews).mockResolvedValue([itemNoUrl])

      await runPipeline({ query: 'test', depth: 'deep', sources: [CoreSource.hackernews] })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('Jina fetch throws for one item — item retains original body, pipeline completes', async () => {
      process.env.MIRA_ENABLE_FULLTEXT = 'true'
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
      vi.stubGlobal('fetch', mockFetch)

      vi.mocked(collectHackerNews).mockResolvedValue([mockItem])

      const result = await runPipeline({
        query: 'test',
        depth: 'deep',
        sources: [CoreSource.hackernews],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.rawItems[0].body).toBe(mockItem.body)
    })
  })

  describe('aggregateThemes options forwarding', () => {
    it('depth: quick passes { skipEmbeddings: true } to all three aggregateThemes calls', async () => {
      vi.mocked(collectHackerNews).mockResolvedValue([mockItem])

      await runPipeline({ query: 'test', depth: 'quick', sources: [CoreSource.hackernews] })

      const calls = vi.mocked(aggregateThemes).mock.calls
      expect(calls.length).toBe(3)
      for (const call of calls) {
        expect(call[1]).toEqual({ skipEmbeddings: true })
      }
    })

    it('depth: deep passes { skipEmbeddings: false } to all three aggregateThemes calls', async () => {
      vi.mocked(collectHackerNews).mockResolvedValue([mockItem])

      await runPipeline({ query: 'test', depth: 'deep', sources: [CoreSource.hackernews] })

      const calls = vi.mocked(aggregateThemes).mock.calls
      expect(calls.length).toBe(3)
      for (const call of calls) {
        expect(call[1]).toEqual({ skipEmbeddings: false })
      }
    })

    it('default depth (quick) passes { skipEmbeddings: true }', async () => {
      await runPipeline({ query: 'test', sources: [CoreSource.hackernews] })

      const calls = vi.mocked(aggregateThemes).mock.calls
      expect(calls.length).toBe(3)
      for (const call of calls) {
        expect(call[1]).toEqual({ skipEmbeddings: true })
      }
    })
  })

  describe('extractionConcurrency cap for quick depth', () => {
    afterEach(() => {
      delete process.env.MIRA_EXTRACTION_CONCURRENCY
    })

    it('caps concurrency at 2 for quick depth when env var is higher', async () => {
      process.env.MIRA_EXTRACTION_CONCURRENCY = '10'
      const items: CollectedItem[] = Array.from({ length: 6 }, (_, i) => ({
        ...mockItem,
        url: `https://example.com/${i}`,
      }))
      vi.mocked(collectHackerNews).mockResolvedValue(items)

      const result = await runPipeline({
        query: 'test',
        depth: 'quick',
        sources: [CoreSource.hackernews],
      })

      expect(result.ok).toBe(true)
      expect(vi.mocked(extractItem)).toHaveBeenCalledTimes(6)
    })

    it('does not cap concurrency for deep depth — uses full env var value', async () => {
      process.env.MIRA_EXTRACTION_CONCURRENCY = '10'
      const items: CollectedItem[] = Array.from({ length: 4 }, (_, i) => ({
        ...mockItem,
        url: `https://example.com/${i}`,
      }))
      vi.mocked(collectHackerNews).mockResolvedValue(items)

      const result = await runPipeline({
        query: 'test',
        depth: 'deep',
        sources: [CoreSource.hackernews],
      })

      expect(result.ok).toBe(true)
      expect(vi.mocked(extractItem)).toHaveBeenCalledTimes(4)
    })

    it('quick depth with env var already at or below 2 uses env var value', async () => {
      process.env.MIRA_EXTRACTION_CONCURRENCY = '1'
      const items: CollectedItem[] = Array.from({ length: 3 }, (_, i) => ({
        ...mockItem,
        url: `https://example.com/${i}`,
      }))
      vi.mocked(collectHackerNews).mockResolvedValue(items)

      const result = await runPipeline({
        query: 'test',
        depth: 'quick',
        sources: [CoreSource.hackernews],
      })

      expect(result.ok).toBe(true)
      expect(vi.mocked(extractItem)).toHaveBeenCalledTimes(3)
    })
  })
})
