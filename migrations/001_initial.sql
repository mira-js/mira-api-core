CREATE TABLE IF NOT EXISTS research_jobs (
  job_id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
