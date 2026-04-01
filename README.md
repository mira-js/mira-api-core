# @mia/api-core

[![npm](https://img.shields.io/npm/v/@mia/api-core)](https://www.npmjs.com/package/@mia/api-core)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/mira-js/mia-core/blob/main/LICENSE)

The MIA research API. A Hono HTTP server backed by a BullMQ async worker that runs the full collection → extraction → clustering → synthesis pipeline. Self-host it; query it from anywhere.

---

## What happens when you submit a query

```
POST /api/v1/research  { query, depth?, sources? }
         │
         ▼
   BullMQ job enqueued (Redis)
         │
         ▼  Worker picks up the job
   ┌─────┴──────────────────────────────────────────────┐
   │  1. Collectors run in parallel                     │
   │     Reddit · HackerNews · RSS                      │
   │                                                    │
   │  2. Each item ingested into OpenViking (optional)  │
   │                                                    │
   │  3. LLM extraction per item (concurrent)           │
   │     → pain_points, sentiment, category, key_quote  │
   │                                                    │
   │  4. Embedding-based theme clustering               │
   │     → groups items by semantic similarity          │
   │                                                    │
   │  5. Final synthesis report (LLM)                   │
   │     → summary, painPoints, competitorWeaknesses,   │
   │       emergingGaps                                 │
   └────────────────────────────────────────────────────┘
         │
         ▼
GET /api/v1/research/:jobId  → ResearchResult
```

---

## Quickstart

The fastest way to run this is via Docker Compose from the [mia-core root](https://github.com/mira-js/mia-core):

```bash
git clone https://github.com/mira-js/mia-core.git
cd mia-core
cp .env.example .env   # set OPENAI_API_KEY at minimum
docker compose up
```

For local development without Docker:

```bash
# From mia-core root
pnpm install && pnpm build
pnpm --filter @mia/api-core migrate
pnpm --filter @mia/api-core start
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | LLM provider API key |
| `OPENAI_BASE_URL` | No | DeepSeek | Any OpenAI-compatible base URL |
| `OPENAI_MODEL` | No | `deepseek-chat` | Model to use for extraction and synthesis |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `PORT` | No | `3000` | HTTP listen port |
| `DASHBOARD_URL` | No | `http://localhost:5173` | CORS allowed origin |
| `REDDIT_CLIENT_ID` | No | — | Reddit OAuth (improves rate limits) |
| `REDDIT_CLIENT_SECRET` | No | — | Reddit OAuth |
| `REDDIT_USERNAME` | No | — | Reddit OAuth |
| `REDDIT_PASSWORD` | No | — | Reddit OAuth |
| `JINA_API_KEY` | No | — | Enables full-text article extraction |
| `MIA_ENABLE_FULLTEXT` | No | `false` | Set `true` to fetch article bodies via Jina |
| `MIA_EXTRACTION_CONCURRENCY` | No | `5` | Parallel LLM calls during extraction phase |
| `MIA_OPENVIKING_INGEST_CONCURRENCY` | No | `10` | Parallel writes to OpenViking |
| `MIA_PROMPTS_DIR` | No | `./prompts` | Directory for custom prompt overrides |
| `OPENVIKING_URL` | No | — | OpenViking base URL (semantic search, optional) |
| `OPENVIKING_API_KEY` | No | — | OpenViking API key (optional) |

---

## REST API

### `POST /api/v1/research`

Enqueue a new research job.

**Request body:**

```ts
{
  query: string                        // required
  depth?: "quick" | "deep"             // default: "quick"
  sources?: string[]                   // default: ["reddit","hackernews","news"]
}
```

**Response `202 Accepted`:**

```json
{ "jobId": "abc123", "status": "queued" }
```

**Depth behaviour:**

| `depth` | Reddit limit | HN limit | Notes |
|---------|:---:|:---:|-------|
| `quick` | 25/subreddit | 20 | Fast, ~30–60 s total |
| `deep` | 50/subreddit | 40 | More coverage, ~60–120 s |

---

### `GET /api/v1/research/:jobId`

Poll for job status and results.

**Response:**

```ts
{
  jobId: string
  status: "queued" | "active" | "completed" | "failed"
  progress?: number       // 0–100, present while active
  createdAt: string       // ISO 8601
  result?: ResearchResult // present when status === "completed"
}
```

**ResearchResult shape:**

```ts
{
  query: string
  summary: string
  painPoints: PainPointTheme[]
  competitorWeaknesses: PainPointTheme[]
  emergingGaps: PainPointTheme[]
  rawItems: CollectedItem[]
}

// PainPointTheme
{
  theme: string
  frequency: number
  sources: string[]
  sentiment: number       // -1.0 to 1.0
  evidence: { source: string; url: string; excerpt: string }[]
}
```

---

### `GET /api/v1/research`

List recent jobs (latest first).

---

### `GET /health`

```json
{ "status": "ok", "timestamp": "2024-01-01T00:00:00.000Z" }
```

---

## Custom prompts

Three prompt templates drive the LLM pipeline:

| File | Phase |
|------|-------|
| `prompts/categorize_content.txt` | First-pass relevance classification |
| `prompts/extract_pain_points.txt` | Structured per-item extraction |
| `prompts/synthesize_report.txt` | Final cross-item synthesis |

Override any or all by setting `MIA_PROMPTS_DIR` to your own directory. Missing files fall back to the bundled defaults — only ship the files you want to change.

```bash
MIA_PROMPTS_DIR=/path/to/my-prompts
```

---

## LLM compatibility

The pipeline uses the OpenAI SDK with a configurable base URL, so it works with any provider that implements the OpenAI chat completions API:

| Provider | `OPENAI_BASE_URL` | `OPENAI_MODEL` |
|----------|-------------------|----------------|
| DeepSeek (default, cheapest) | `https://api.deepseek.com` | `deepseek-chat` |
| OpenAI | *(omit)* | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.2` |

---

## Database

A single PostgreSQL table (`research_jobs`) stores job metadata. Run the migration before first start:

```bash
pnpm --filter @mia/api-core migrate
```

---

## Part of mia-core

This package is part of the [mia-core](https://github.com/mira-js/mia-core) monorepo — a self-hostable market intelligence engine.
