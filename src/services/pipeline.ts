import { collectReddit, collectHackerNews, collectNewsRSS } from '@mira/core-collectors'
import {
  CoreSource,
  type CollectedItem,
  type ExtractionResult,
  type ResearchDepth,
  type ResearchJobInput,
  type ResearchResult,
  type Result,
} from '@mira/shared-core'
import { openVikingClient } from './openviking.js'
import { extractItem, aggregateThemes, synthesizeReport } from './analysis.js'
import { mapWithConcurrency } from './concurrency.js'

const DEFAULT_RSS_FEEDS = ['https://techcrunch.com/feed/']

const DEFAULT_SOURCES: string[] = [CoreSource.reddit, CoreSource.hackernews, CoreSource.news]
const DEFAULT_EXTRACTION_CONCURRENCY = 5
const DEFAULT_OPENVIKING_INGEST_CONCURRENCY = 10

function readPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const int = Math.floor(n)
  return int > 0 ? int : fallback
}

async function collectFromSource(source: string, query: string, depth: ResearchDepth): Promise<CollectedItem[]> {
  switch (source) {
    case CoreSource.reddit:
      return collectReddit({ subreddits: ['SaaS', 'startups', 'smallbusiness'], query, limit: depth === 'deep' ? 50 : 25 })
    case CoreSource.hackernews:
      return collectHackerNews({ query, limit: depth === 'deep' ? 40 : 20, tags: 'story' })
    case CoreSource.news:
      return collectNewsRSS({ feeds: DEFAULT_RSS_FEEDS, query })
    default:
      return []
  }
}

async function collectAllItems(sources: string[], query: string, depth: ResearchDepth): Promise<CollectedItem[]> {
  const settled = await Promise.allSettled(sources.map((s) => collectFromSource(s, query, depth)))
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

async function enrichItemsWithFullText(items: readonly CollectedItem[]): Promise<CollectedItem[]> {
  const concurrency = readPositiveInt(process.env.MIRA_FULLTEXT_CONCURRENCY, 10)
  return mapWithConcurrency(items, concurrency, async (item) => {
    if (!item.url) return item
    try {
      const headers: Record<string, string> = { Accept: 'text/markdown', 'X-Return-Format': 'markdown' }
      if (process.env.JINA_API_KEY) headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`
      const response = await fetch(`https://r.jina.ai/${item.url}`, { headers, signal: AbortSignal.timeout(10_000) })
      if (!response.ok) return item
      const fullText = await response.text()
      return fullText ? { ...item, body: fullText } : item
    } catch {
      return item
    }
  })
}

async function ingestIntoOpenViking(items: readonly CollectedItem[], concurrency: number): Promise<void> {
  await mapWithConcurrency(items, concurrency, async (item) => {
    try {
      await openVikingClient.addResource(item)
    } catch {
      // Fire-and-forget — never block the pipeline result
    }
  })
}

type ExtractionPair = { item: CollectedItem; extraction: ExtractionResult }

async function extractOkPairs(items: readonly CollectedItem[], concurrency: number): Promise<ExtractionPair[]> {
  const results = await mapWithConcurrency(items, concurrency, (item) => extractItem(item))
  return results.flatMap((r, i) => (r.ok ? [{ item: items[i], extraction: r.value }] : []))
}

function bucketPairs(pairs: ExtractionPair[]): {
  painPointPairs: ExtractionPair[]
  competitorPairs: ExtractionPair[]
  gapPairs: ExtractionPair[]
} {
  return {
    painPointPairs: pairs.filter((p) => p.extraction.category === 'complaint' || p.extraction.category === 'workflow-friction'),
    competitorPairs: pairs.filter((p) => p.extraction.category === 'switching-signal'),
    gapPairs: pairs.filter((p) => p.extraction.category === 'feature-request' || p.extraction.category === 'pricing'),
  }
}

export async function runPipeline(input: ResearchJobInput): Promise<Result<ResearchResult>> {
  try {
    const sources = input.sources ?? DEFAULT_SOURCES
    const depth = input.depth ?? 'quick'
    const openVikingIngestConcurrency = readPositiveInt(process.env.MIRA_OPENVIKING_INGEST_CONCURRENCY, DEFAULT_OPENVIKING_INGEST_CONCURRENCY)
    const baseExtractionConcurrency = readPositiveInt(process.env.MIRA_EXTRACTION_CONCURRENCY, DEFAULT_EXTRACTION_CONCURRENCY)
    const extractionConcurrency = depth === 'quick' ? Math.min(baseExtractionConcurrency, 2) : baseExtractionConcurrency

    const allItems = await collectAllItems(sources, input.query, depth)

    const enableFullText = process.env.MIRA_ENABLE_FULLTEXT === 'true'
    const enrichedItems = depth === 'deep' && enableFullText
      ? await enrichItemsWithFullText(allItems)
      : allItems

    void ingestIntoOpenViking(enrichedItems, openVikingIngestConcurrency)

    const pairs = await extractOkPairs(enrichedItems, extractionConcurrency)
    const { painPointPairs, competitorPairs, gapPairs } = bucketPairs(pairs)

    const aggregateOptions = { skipEmbeddings: depth === 'quick' }
    const [painPointsResult, competitorResult, gapResult] = await Promise.all([
      aggregateThemes(painPointPairs, aggregateOptions),
      aggregateThemes(competitorPairs, aggregateOptions),
      aggregateThemes(gapPairs, aggregateOptions),
    ])

    const painPoints = painPointsResult.ok ? painPointsResult.value : []
    const competitorWeaknesses = competitorResult.ok ? competitorResult.value : []
    const emergingGaps = gapResult.ok ? gapResult.value : []

    const summaryResult = await synthesizeReport(input.query, { painPoints, competitorWeaknesses, emergingGaps })
    if (!summaryResult.ok) return { ok: false, error: summaryResult.error }

    return {
      ok: true,
      value: {
        query: input.query,
        summary: summaryResult.value,
        painPoints,
        competitorWeaknesses,
        emergingGaps,
        rawItems: enrichedItems,
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
  }
}
