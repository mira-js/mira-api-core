"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPipeline = runPipeline;
const core_collectors_1 = require("@mia/core-collectors");
const shared_core_1 = require("@mia/shared-core");
const openviking_js_1 = require("./openviking.js");
const analysis_js_1 = require("./analysis.js");
const concurrency_js_1 = require("./concurrency.js");
const DEFAULT_RSS_FEEDS = ['https://techcrunch.com/feed/'];
const DEFAULT_SOURCES = [shared_core_1.Source.reddit, shared_core_1.Source.hackernews, shared_core_1.Source.news];
const DEFAULT_EXTRACTION_CONCURRENCY = 5;
const DEFAULT_OPENVIKING_INGEST_CONCURRENCY = 10;
function readPositiveInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return fallback;
    const int = Math.floor(n);
    return int > 0 ? int : fallback;
}
async function collectFromSource(source, query, depth) {
    switch (source) {
        case shared_core_1.Source.reddit:
            return (0, core_collectors_1.collectReddit)({ subreddits: ['SaaS', 'startups', 'smallbusiness'], query, limit: depth === 'deep' ? 50 : 25 });
        case shared_core_1.Source.hackernews:
            return (0, core_collectors_1.collectHackerNews)({ query, limit: depth === 'deep' ? 40 : 20, tags: 'story' });
        case shared_core_1.Source.news:
            return (0, core_collectors_1.collectNewsRSS)({ feeds: DEFAULT_RSS_FEEDS, query });
    }
}
async function collectAllItems(sources, query, depth) {
    const settled = await Promise.allSettled(sources.map((s) => collectFromSource(s, query, depth)));
    return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
async function enrichItemsWithFullText(items) {
    const concurrency = readPositiveInt(process.env.MIA_FULLTEXT_CONCURRENCY, 10);
    return (0, concurrency_js_1.mapWithConcurrency)(items, concurrency, async (item) => {
        if (!item.url)
            return item;
        try {
            const headers = { Accept: 'text/markdown', 'X-Return-Format': 'markdown' };
            if (process.env.JINA_API_KEY)
                headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
            const response = await fetch(`https://r.jina.ai/${item.url}`, { headers, signal: AbortSignal.timeout(10_000) });
            if (!response.ok)
                return item;
            const fullText = await response.text();
            return fullText ? { ...item, body: fullText } : item;
        }
        catch {
            return item;
        }
    });
}
async function ingestIntoOpenViking(items, concurrency) {
    await (0, concurrency_js_1.mapWithConcurrency)(items, concurrency, async (item) => {
        try {
            await openviking_js_1.openVikingClient.addResource(item);
        }
        catch {
            // Fire-and-forget — never block the pipeline result
        }
    });
}
async function extractOkPairs(items, concurrency) {
    const results = await (0, concurrency_js_1.mapWithConcurrency)(items, concurrency, (item) => (0, analysis_js_1.extractItem)(item));
    return results.flatMap((r, i) => (r.ok ? [{ item: items[i], extraction: r.value }] : []));
}
function bucketPairs(pairs) {
    return {
        painPointPairs: pairs.filter((p) => p.extraction.category === 'complaint' || p.extraction.category === 'workflow-friction'),
        competitorPairs: pairs.filter((p) => p.extraction.category === 'switching-signal'),
        gapPairs: pairs.filter((p) => p.extraction.category === 'feature-request' || p.extraction.category === 'pricing'),
    };
}
async function runPipeline(input) {
    try {
        const sources = input.sources ?? DEFAULT_SOURCES;
        const depth = input.depth ?? 'quick';
        const openVikingIngestConcurrency = readPositiveInt(process.env.MIA_OPENVIKING_INGEST_CONCURRENCY, DEFAULT_OPENVIKING_INGEST_CONCURRENCY);
        const baseExtractionConcurrency = readPositiveInt(process.env.MIA_EXTRACTION_CONCURRENCY, DEFAULT_EXTRACTION_CONCURRENCY);
        const extractionConcurrency = depth === 'quick' ? Math.min(baseExtractionConcurrency, 2) : baseExtractionConcurrency;
        const allItems = await collectAllItems(sources, input.query, depth);
        const enableFullText = process.env.MIA_ENABLE_FULLTEXT === 'true';
        const enrichedItems = depth === 'deep' && enableFullText
            ? await enrichItemsWithFullText(allItems)
            : allItems;
        void ingestIntoOpenViking(enrichedItems, openVikingIngestConcurrency);
        const pairs = await extractOkPairs(enrichedItems, extractionConcurrency);
        const { painPointPairs, competitorPairs, gapPairs } = bucketPairs(pairs);
        const aggregateOptions = { skipEmbeddings: depth === 'quick' };
        const [painPointsResult, competitorResult, gapResult] = await Promise.all([
            (0, analysis_js_1.aggregateThemes)(painPointPairs, aggregateOptions),
            (0, analysis_js_1.aggregateThemes)(competitorPairs, aggregateOptions),
            (0, analysis_js_1.aggregateThemes)(gapPairs, aggregateOptions),
        ]);
        const painPoints = painPointsResult.ok ? painPointsResult.value : [];
        const competitorWeaknesses = competitorResult.ok ? competitorResult.value : [];
        const emergingGaps = gapResult.ok ? gapResult.value : [];
        const summaryResult = await (0, analysis_js_1.synthesizeReport)(input.query, { painPoints, competitorWeaknesses, emergingGaps });
        if (!summaryResult.ok)
            return { ok: false, error: summaryResult.error };
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
        };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}
//# sourceMappingURL=pipeline.js.map