-- DevSecOps Platform - Database Schema
-- Safe to run repeatedly (npm run migrate): new tables are created if missing
-- and new columns are added to databases created by an older version.

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(50) DEFAULT 'developer',
    created_at    TIMESTAMP DEFAULT NOW()
);

-- GitHub connection (token is stored AES-256-GCM encrypted, never in clear text)
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_login        VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token_enc    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_connected_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS projects (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name             VARCHAR(150) NOT NULL,
    github_repo_url  VARCHAR(500),
    created_at       TIMESTAMP DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_owner  VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo   VARCHAR(150);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS branch        VARCHAR(255) DEFAULT 'main';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gate_config   JSONB;          -- NULL = platform defaults
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deploy_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS live_url      VARCHAR(500);   -- latest successful deployment

CREATE TABLE IF NOT EXISTS scans (
    id             SERIAL PRIMARY KEY,
    project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    status         VARCHAR(50) DEFAULT 'pending',   -- pending | running | completed | failed
    security_score INTEGER,
    gate_status    VARCHAR(20),                     -- PASS | FAIL
    triggered_by   VARCHAR(100),                    -- e.g. 'manual'
    started_at     TIMESTAMP DEFAULT NOW(),
    completed_at   TIMESTAMP
);

ALTER TABLE scans ADD COLUMN IF NOT EXISTS branch       VARCHAR(255);
ALTER TABLE scans ADD COLUMN IF NOT EXISTS commit_sha   VARCHAR(64);
ALTER TABLE scans ADD COLUMN IF NOT EXISTS run_url      VARCHAR(500);  -- GitHub Actions run page
ALTER TABLE scans ADD COLUMN IF NOT EXISTS counts       JSONB;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS secrets_count INTEGER DEFAULT 0;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS gate_reasons JSONB;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS scanners     JSONB;         -- per-scanner status
ALTER TABLE scans ADD COLUMN IF NOT EXISTS error        TEXT;

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id             SERIAL PRIMARY KEY,
    scan_id        INTEGER REFERENCES scans(id) ON DELETE CASCADE,
    tool           VARCHAR(100),   -- Semgrep | OWASP Dependency-Check | Gitleaks | Trivy
    type           VARCHAR(100),   -- sast | dependency | secret | container
    title          VARCHAR(255) NOT NULL,
    severity       VARCHAR(20) NOT NULL,   -- Critical | High | Medium | Low
    description    TEXT,
    file_component VARCHAR(255),
    status         VARCHAR(50) DEFAULT 'open',
    created_at     TIMESTAMP DEFAULT NOW()
);

ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS line    INTEGER;
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS rule_id VARCHAR(255);
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS cve     VARCHAR(100);

CREATE TABLE IF NOT EXISTS deployments (
    id           SERIAL PRIMARY KEY,
    project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    scan_id      INTEGER REFERENCES scans(id),
    status       VARCHAR(50),   -- blocked | allowed | deployed | failed
    deployed_at  TIMESTAMP,
    logs         TEXT,
    created_at   TIMESTAMP DEFAULT NOW()
);

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS url         VARCHAR(500);
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS environment VARCHAR(100);

CREATE TABLE IF NOT EXISTS audit_logs (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id),
    action     VARCHAR(255),
    details    TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_user_repo ON projects(user_id, github_owner, github_repo);
CREATE INDEX IF NOT EXISTS idx_projects_user       ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_project        ON scans(project_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_scan ON vulnerabilities(scan_id);
CREATE INDEX IF NOT EXISTS idx_deployments_project  ON deployments(project_id);

-- Sign in with GitHub: the numeric GitHub account id never changes (the username can).
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_github_id ON users(github_id) WHERE github_id IS NOT NULL;

-- Forgot password: only a SHA-256 hash of the emailed token is stored, never the token itself.
CREATE TABLE IF NOT EXISTS password_resets (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_user  ON password_resets(user_id);
