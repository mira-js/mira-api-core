"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractItem = extractItem;
exports.aggregateThemes = aggregateThemes;
exports.synthesizeReport = synthesizeReport;
const zod_1 = require("zod");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const llm_js_1 = require("./llm.js");
// ─── Zod schemas ──────────────────────────────────────────────────────────────
const ExtractionResultSchema = zod_1.z.object({
    pain_points: zod_1.z.array(zod_1.z.string()),
    sentiment: zod_1.z.enum(['negative', 'neutral', 'positive']),
    category: zod_1.z.enum(['complaint', 'feature-request', 'workflow-friction', 'pricing', 'switching-signal']),
    mentioned_tools: zod_1.z.array(zod_1.z.string()),
    key_quote: zod_1.z.string(),
});
const JinaResponseSchema = zod_1.z.object({
    data: zod_1.z.array(zod_1.z.object({ index: zod_1.z.number(), embedding: zod_1.z.array(zod_1.z.number()) })),
});
// ─── Prompt helpers ───────────────────────────────────────────────────────────
const PROMPTS_DIR = process.env.MIA_PROMPTS_DIR ?? (0, node_path_1.join)(__dirname, '../../../../prompts');
function loadPrompt(filename) {
    return (0, node_fs_1.readFileSync)((0, node_path_1.join)(PROMPTS_DIR, filename), 'utf8');
}
function fillTemplate(template, vars) {
    return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), template);
}
function stripFences(raw) {
    return raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
}
// ─── Jina embeddings ──────────────────────────────────────────────────────────
async function getEmbeddings(texts) {
    if (!process.env.JINA_API_KEY) {
        throw new Error('JINA_API_KEY is required for embeddings');
    }
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'jina-embeddings-v4',
            task: 'text-matching',
            input: texts,
        }),
    });
    if (!res.ok) {
        throw new Error(`Jina embeddings failed: ${res.status} ${res.statusText}`);
    }
    const parsed = JinaResponseSchema.parse(await res.json());
    return parsed.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
}
// ─── Clustering helpers ───────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (magA === 0 || magB === 0)
        return 0;
    return dot / (magA * magB);
}
function greedyCluster(items, embeddings, threshold) {
    const assigned = new Array(items.length).fill(false);
    const clusters = [];
    for (let i = 0; i < items.length; i++) {
        if (assigned[i])
            continue;
        const cluster = [items[i]];
        assigned[i] = true;
        for (let j = i + 1; j < items.length; j++) {
            if (assigned[j])
                continue;
            if (cosineSimilarity(embeddings[i], embeddings[j]) >= threshold) {
                cluster.push(items[j]);
                assigned[j] = true;
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}
// ─── Sentiment scoring ────────────────────────────────────────────────────────
const sentimentScore = { negative: -1, neutral: 0, positive: 1 };
// ─── Exported functions ───────────────────────────────────────────────────────
async function extractItem(item) {
    try {
        const content = [item.title, item.body, ...item.raw_replies.slice(0, 5)].join('\n\n');
        const template = loadPrompt('extract_pain_points.txt');
        const prompt = fillTemplate(template, { content, source: item.source });
        const raw = await (0, llm_js_1.callLLM)([{ role: 'user', content: prompt }]);
        const parsed = JSON.parse(stripFences(raw));
        return { ok: true, value: ExtractionResultSchema.parse(parsed) };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}
function clusterByStringDedup(pairs) {
    const seen = new Map();
    for (const pair of pairs) {
        const key = pair.extraction.key_quote;
        if (!seen.has(key))
            seen.set(key, []);
        seen.get(key).push(pair);
    }
    return Array.from(seen.values());
}
async function aggregateThemes(pairs, options) {
    try {
        if (pairs.length === 0)
            return { ok: true, value: [] };
        const clusters = options?.skipEmbeddings
            ? clusterByStringDedup(pairs)
            : greedyCluster(pairs, await getEmbeddings(pairs.map((p) => p.extraction.pain_points.join(' ') + ' ' + p.extraction.key_quote)), 0.75);
        return {
            ok: true,
            value: clusters
                .map((cluster) => {
                const avgSentiment = cluster.reduce((sum, p) => sum + sentimentScore[p.extraction.sentiment], 0) / cluster.length;
                return {
                    theme: cluster[0].extraction.key_quote,
                    frequency: cluster.length,
                    sources: [...new Set(cluster.map((p) => p.item.source))],
                    sentiment: avgSentiment,
                    evidence: cluster.slice(0, 3).map((p) => ({
                        source: p.item.source,
                        url: p.item.url,
                        excerpt: p.extraction.key_quote,
                    })),
                };
            })
                .sort((a, b) => b.frequency - a.frequency),
        };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}
async function synthesizeReport(query, themes) {
    try {
        const template = loadPrompt('synthesize_report.txt');
        const prompt = fillTemplate(template, { query, themes: JSON.stringify(themes, null, 2) });
        const value = await (0, llm_js_1.callLLM)([{ role: 'user', content: prompt }], { maxTokens: 2048, temperature: 0.2 });
        return { ok: true, value };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}
//# sourceMappingURL=analysis.js.map