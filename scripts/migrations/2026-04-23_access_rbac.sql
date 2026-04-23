-- 내부 RBAC: 가입 요청 + 승인 사용자 (Neon 등 PostgreSQL)
-- 적용: psql 또는 Neon SQL Editor에서 실행, 또는 init-db가 IF NOT EXISTS로 생성

CREATE TABLE IF NOT EXISTS access_requests (
  id SERIAL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(200),
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolver_email VARCHAR(320)
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_email_lower ON access_requests(lower(email));

CREATE TABLE IF NOT EXISTS approved_users (
  email VARCHAR(320) PRIMARY KEY,
  dashboard_role VARCHAR(32) NOT NULL CHECK (dashboard_role IN ('owner', 'internal_dabi')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_request_id INT REFERENCES access_requests(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approved_users_role ON approved_users(dashboard_role);
