CREATE TABLE IF NOT EXISTS debug_reports (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitter_email VARCHAR(320) NOT NULL,
  submitter_name VARCHAR(200),
  title VARCHAR(500),
  body_markdown TEXT NOT NULL,
  context_json TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  mail_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_debug_reports_created ON debug_reports(created_at DESC);
