# PRD: Bootstrap Backend

## Introduction

A bootstrap system for initializing the desiAgent backend with essential data: super admin user with API key, user table schema, and seed agents from CSV. Supports both automatic initialization on first start and manual CLI-triggered bootstrap.

---

## Goals

- Provide CLI command (`bun run bootstrap-admin`) to create super admin with API key
- Auto-generate API key and output to both console and secure file
- Ensure user table exists (created on first user or during bootstrap)
- Seed agents table from `~/.desiAgent/seed/agents.csv` matching desiAgent library schema
- Support auto-detection on first start + manual re-run option

---

## User Stories

### US-001: Bootstrap CLI Command
**Description:** As a developer, I want a CLI command to bootstrap the admin so that I can initialize the system manually.

**Acceptance Criteria:**
- [ ] Create `scripts/bootstrap.ts` executable via `bun run bootstrap-admin`
- [ ] Add script to package.json: `"bootstrap-admin": "bun run scripts/bootstrap.ts"`
- [ ] Command accepts optional `--force` flag to re-run even if admin exists
- [ ] Command exits with code 0 on success, 1 on failure
- [ ] Typecheck passes

---

### US-002: Admin Database Initialization
**Description:** As the system, I need to ensure admin.db exists with proper schema before creating admin.

**Acceptance Criteria:**
- [ ] Create `~/.desiAgent/admin.db` if it doesn't exist
- [ ] Admin DB contains `tenants` table (id, name, slug, status, plan, quotas, createdAt, updatedAt)
- [ ] Admin DB contains `super_admins` table (id, email, name, passwordHash, createdAt, updatedAt)
- [ ] Admin DB contains `admin_api_keys` table (id, adminId, keyHash, keyPrefix, scopes, expiresAt, createdAt, revokedAt)
- [ ] Uses Drizzle ORM for schema management
- [ ] Typecheck passes

---

### US-003: Super Admin Creation
**Description:** As a developer, I want the bootstrap to create a super admin so that I can manage tenants.

**Acceptance Criteria:**
- [ ] Create super admin with email from `ADMIN_EMAIL` env var (default: `admin@desiagent.local`)
- [ ] Create super admin with name from `ADMIN_NAME` env var (default: `Super Admin`)
- [ ] If admin already exists, skip creation (unless `--force` flag)
- [ ] Store admin record in `super_admins` table
- [ ] Typecheck passes

---

### US-004: Admin API Key Generation
**Description:** As a developer, I want an API key generated for the admin so that I can authenticate programmatically.

**Acceptance Criteria:**
- [ ] Generate API key in format: `desi_sk_admin_{random32chars}`
- [ ] Store bcrypt hash of key in `admin_api_keys` table
- [ ] Store key prefix (`desi_sk_admin_xxxx`) for identification
- [ ] Set scopes to `["admin", "read", "write", "execute"]`
- [ ] Set expiresAt to null (admin keys never expire)
- [ ] Print full key to console with clear warning: "Save this key - it won't be shown again"
- [ ] Save full key to `~/.desiAgent/admin-key.txt` with 600 permissions
- [ ] If key file exists and `--force` not set, warn and skip
- [ ] Typecheck passes

---

### US-005: User Table Schema
**Description:** As the system, I need user table schema defined so that users can be created per tenant.

**Acceptance Criteria:**
- [ ] Define user schema in `src/db/user-schema.ts` for tenant databases
- [ ] User fields: id, email, name, role ('admin' | 'member' | 'viewer'), tenantId, apiKeyId, createdAt, updatedAt
- [ ] Users belong to exactly one tenant (single-tenant membership)
- [ ] Schema uses Drizzle ORM
- [ ] Table created automatically when tenant DB is initialized
- [ ] Typecheck passes

---

### US-006: Agents CSV Seed File Format
**Description:** As a developer, I want a defined CSV format so that I can prepare agent seed data.

**Acceptance Criteria:**
- [ ] Document expected CSV location: `~/.desiAgent/seed/agents.csv`
- [ ] CSV columns match desiAgent agent schema:
  - `id` (UUID, optional - auto-generated if empty)
  - `name` (required)
  - `version` (required, e.g., "1.0.0")
  - `promptTemplate` (required, can use `\n` for newlines)
  - `provider` (optional: 'openai' | 'openrouter' | 'ollama')
  - `model` (optional)
  - `active` (optional: 'true' | 'false', default 'false')
  - `metadata` (optional: JSON string)
- [ ] Create example CSV at `scripts/example-agents.csv`
- [ ] Typecheck passes

---

### US-007: Agents Seeding from CSV
**Description:** As the system, I want to seed agents from CSV so that initial agents are available.

**Acceptance Criteria:**
- [ ] Read `~/.desiAgent/seed/agents.csv` if it exists
- [ ] Parse CSV with proper handling of quoted fields and escaped characters
- [ ] Skip header row
- [ ] Generate UUID for id if not provided
- [ ] Validate required fields (name, version, promptTemplate)
- [ ] Insert agents into admin.db `agents` table (or designated seed location)
- [ ] Skip agents that already exist (by name+version unique constraint)
- [ ] Log count of inserted vs skipped agents
- [ ] Handle missing CSV file gracefully (log warning, continue)
- [ ] Typecheck passes

---

### US-008: Auto-Bootstrap on First Start
**Description:** As the system, I want automatic bootstrap on first start so that setup is seamless.

**Acceptance Criteria:**
- [ ] On server start, check if `~/.desiAgent/admin.db` exists
- [ ] If not exists, run bootstrap automatically
- [ ] If exists but no super admin, prompt in logs to run `bun run bootstrap-admin`
- [ ] Auto-bootstrap creates admin.db, super admin, API key, default tenant, and seeds agents
- [ ] Bootstrap status logged clearly to console
- [ ] Typecheck passes

---

### US-009: Default Tenant Creation
**Description:** As a developer, I want a default tenant created during bootstrap so that I can test the system immediately.

**Acceptance Criteria:**
- [ ] Create tenant with name "default" and slug "default"
- [ ] Set status to "active" and plan to "free"
- [ ] Create tenant database at `~/.desiAgent/tenants/default/agent.db`
- [ ] Initialize tenant DB with user table schema
- [ ] Skip if default tenant already exists (unless `--force`)
- [ ] Typecheck passes

---

### US-010: Bootstrap Idempotency
**Description:** As a developer, I want bootstrap to be safe to re-run so that I don't corrupt data.

**Acceptance Criteria:**
- [ ] Running bootstrap twice without `--force` preserves existing data
- [ ] Existing admin not overwritten
- [ ] Existing API keys not regenerated (unless `--force`)
- [ ] Existing agents not duplicated (unique constraint on name+version)
- [ ] `--force` flag regenerates API key and updates admin
- [ ] Clear console output indicating what was created vs skipped
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** Bootstrap creates `~/.desiAgent/` directory structure if missing
- **FR-2:** Admin database path: `~/.desiAgent/admin.db`
- **FR-3:** Seed files location: `~/.desiAgent/seed/`
- **FR-4:** API key file location: `~/.desiAgent/admin-key.txt`
- **FR-5:** API key format: `desi_sk_admin_{32 random alphanumeric chars}`
- **FR-6:** Passwords and API keys stored as bcrypt hashes (cost factor 12)
- **FR-7:** All timestamps stored as Unix timestamps (seconds)
- **FR-8:** CSV parsing handles: quoted fields, escaped quotes, newlines in fields
- **FR-9:** Bootstrap runs in under 5 seconds for typical seed data

---

## Non-Goals

- User password authentication (API key only in Phase 1)
- Multi-tenant user creation during bootstrap
- OAuth2 setup
- Remote/cloud database support
- Backup/restore functionality

---

## Technical Considerations

### Dependencies
| Package | Purpose |
|---------|---------|
| drizzle-orm | Database ORM |
| better-sqlite3 | SQLite driver |
| bcrypt | Password/key hashing |
| csv-parse | CSV parsing |
| nanoid | Random ID generation |

### File Structure
```
scripts/
├── bootstrap.ts          # CLI entry point
├── example-agents.csv    # Example seed file
src/
├── db/
│   ├── admin-schema.ts   # Admin DB schema (tenants, super_admins, admin_api_keys)
│   ├── user-schema.ts    # Per-tenant user schema
│   └── seed.ts           # Seeding logic
├── services/
│   └── bootstrap.ts      # Bootstrap service logic
```

### Admin Database Schema
```sql
-- super_admins table
CREATE TABLE super_admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- admin_api_keys table
CREATE TABLE admin_api_keys (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES super_admins(id),
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL, -- JSON array
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

-- agents table (for seeding)
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  metadata TEXT, -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(name, version)
);
```

---

## Success Metrics

- Bootstrap completes successfully on fresh system
- API key authenticates against admin endpoints
- Agents from CSV visible in agent list API
- Re-running bootstrap is safe and idempotent
- Clear console output shows what was created/skipped

---

## Design Decisions

- **Default tenant:** Bootstrap creates a default tenant named "default" for testing purposes
- **API key expiration:** Admin API keys never expire (expiresAt = null)
- **Seed file format:** CSV is the only supported format for agent seeding
