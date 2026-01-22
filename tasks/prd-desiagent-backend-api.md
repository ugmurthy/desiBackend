# PRD: desiAgent Backend API

## Introduction

A RESTful backend service exposing the desiAgent library functionality via HTTP APIs. Built with Bun 1.3.5 and Fastify, it provides multi-tenant access to autonomous agent workflows using a database-per-tenant isolation strategy.

This PRD covers **Phase 1 (Core API MVP)** with API key authentication (OAuth2 deferred to Phase 3).

---

## Goals

- Expose all desiAgent library functionality via RESTful HTTP endpoints
- Implement multi-tenant isolation using database-per-tenant strategy
- Provide API key authentication for programmatic access
- Support full billing and usage tracking from day one
- Implement rate limiting for API protection
- Provide comprehensive error handling and health checks

---

## User Stories

### US-001: Project Setup & Configuration
**Description:** As a developer, I want the project scaffolded with Fastify and Bun so that I can start building endpoints.

**Acceptance Criteria:**
- [ ] Initialize Bun project with `bun init`
- [ ] Install dependencies: fastify, @fastify/cors, @fastify/env, @fastify/multipart, @fastify/rate-limit
- [ ] Create project structure per PRD spec (src/, routes/, services/, plugins/, etc.)
- [ ] Configure environment schema with all required variables
- [ ] Basic health check endpoint returns `{ status: "ok" }`
- [ ] Typecheck passes with `bun run check` or equivalent

---

### US-002: Database-per-Tenant Infrastructure
**Description:** As the system, I need to manage separate SQLite databases per tenant so that data is isolated.

**Acceptance Criteria:**
- [ ] Create central admin database at `~/.desiAgent/admin.db`
- [ ] Implement Tenant schema (id, name, slug, status, plan, quotas, timestamps)
- [ ] Tenant databases created at `~/.desiAgent/tenants/{tenant_id}/agent.db`
- [ ] TenantClientService manages desiAgent client instances per tenant
- [ ] Tenant context plugin injects tenant info into request
- [ ] Typecheck passes

---

### US-003: API Key Authentication
**Description:** As a developer, I want to authenticate via API keys so that I can access the API programmatically.

**Acceptance Criteria:**
- [ ] API key format: `desi_sk_{env}_{random}` (e.g., `desi_sk_live_abc123...`)
- [ ] Keys stored as bcrypt hashes in tenant database
- [ ] Support scopes: `read`, `write`, `execute`, `admin`
- [ ] Auth middleware validates `Authorization: Bearer desi_sk_...` header
- [ ] Invalid/expired keys return 401 with clear error message
- [ ] Typecheck passes

---

### US-004: Auth & API Key Management Endpoints
**Description:** As a user, I want to manage my API keys so that I can control programmatic access.

**Acceptance Criteria:**
- [ ] `GET /api/v2/auth/me` - Returns current user info from API key
- [ ] `GET /api/v2/auth/api-keys` - Lists user's API keys (prefix only, not full key)
- [ ] `POST /api/v2/auth/api-keys` - Creates new API key, returns full key once
- [ ] `DELETE /api/v2/auth/api-keys/:id` - Revokes API key
- [ ] All endpoints require valid API key authentication
- [ ] Typecheck passes

---

### US-005: User Management Endpoints
**Description:** As a tenant admin, I want to manage users so that I can control access to my tenant.

**Acceptance Criteria:**
- [ ] User schema implemented per tenant DB (id, email, name, role, etc.)
- [ ] `GET /api/v2/users` - List tenant users (admin only)
- [ ] `GET /api/v2/users/:id` - Get user by ID
- [ ] `PATCH /api/v2/users/:id` - Update user role (admin only)
- [ ] `DELETE /api/v2/users/:id` - Remove user from tenant (admin only)
- [ ] `POST /api/v2/users/invite` - Invite user to tenant (admin only)
- [ ] Role-based access control enforced
- [ ] Typecheck passes

---

### US-006: Agents Service Endpoints
**Description:** As a user, I want to manage agents via API so that I can create and configure autonomous agents.

**Acceptance Criteria:**
- [ ] `POST /api/v2/agents` - Create agent with validation
- [ ] `GET /api/v2/agents` - List agents with filters (status, name, pagination)
- [ ] `GET /api/v2/agents/:id` - Get agent by ID
- [ ] `PATCH /api/v2/agents/:id` - Update agent
- [ ] `DELETE /api/v2/agents/:id` - Delete agent
- [ ] `POST /api/v2/agents/:id/activate` - Activate agent
- [ ] `GET /api/v2/agents/resolve/:name` - Resolve agent by name
- [ ] All operations scoped to authenticated tenant
- [ ] Typecheck passes

---

### US-007: DAGs Service Endpoints
**Description:** As a user, I want to manage DAGs via API so that I can define and execute agent workflows.

**Acceptance Criteria:**
- [ ] `POST /api/v2/dags` - Create DAG from goal
- [ ] `GET /api/v2/dags` - List DAGs with filters
- [ ] `GET /api/v2/dags/scheduled` - List scheduled DAGs
- [ ] `GET /api/v2/dags/:id` - Get DAG by ID
- [ ] `PATCH /api/v2/dags/:id` - Update DAG
- [ ] `DELETE /api/v2/dags/:id` - Safe delete DAG
- [ ] `POST /api/v2/dags/:id/execute` - Execute DAG
- [ ] `POST /api/v2/dags/execute-definition` - Execute DAG definition directly
- [ ] `POST /api/v2/dags/experiments` - Run experiments
- [ ] Typecheck passes

---

### US-008: Executions Service Endpoints
**Description:** As a user, I want to manage executions via API so that I can track and control running workflows.

**Acceptance Criteria:**
- [ ] `GET /api/v2/executions` - List executions with filters (status, dagId, date range)
- [ ] `GET /api/v2/executions/:id` - Get execution by ID
- [ ] `GET /api/v2/executions/:id/details` - Get execution with sub-steps
- [ ] `GET /api/v2/executions/:id/sub-steps` - Get sub-steps only
- [ ] `DELETE /api/v2/executions/:id` - Delete execution
- [ ] `POST /api/v2/executions/:id/resume` - Resume paused execution
- [ ] Typecheck passes

---

### US-009: Tools Service Endpoint
**Description:** As a user, I want to list available tools so that I can configure agents appropriately.

**Acceptance Criteria:**
- [ ] `GET /api/v2/tools` - Returns list of available tools with metadata
- [ ] Response includes tool name, description, parameters schema
- [ ] Typecheck passes

---

### US-010: Costs Service Endpoints
**Description:** As a user, I want to view cost breakdowns so that I can monitor LLM usage and expenses.

**Acceptance Criteria:**
- [ ] `GET /api/v2/costs/executions/:id` - Get execution cost breakdown
- [ ] `GET /api/v2/costs/dags/:id` - Get DAG cost breakdown
- [ ] `GET /api/v2/costs/summary` - Get cost summary with date filters
- [ ] Cost data includes token counts, model used, calculated cost
- [ ] Typecheck passes

---

### US-011: Billing & Usage Tracking
**Description:** As the system, I need to track usage for billing so that tenants can be charged accurately.

**Acceptance Criteria:**
- [ ] UsageRecord schema: tenantId, resourceType, quantity, unitCost, metadata, timestamp
- [ ] Invoice schema: tenantId, period, lineItems, totals, status, timestamps
- [ ] Usage tracked per execution (tokens, compute time)
- [ ] `GET /api/v2/billing/usage` - Current period usage
- [ ] `GET /api/v2/billing/usage/history` - Historical usage with date filters
- [ ] `GET /api/v2/billing/invoices` - List invoices
- [ ] `GET /api/v2/billing/invoices/:id` - Get invoice details
- [ ] Typecheck passes

---

### US-012: Admin & Tenant Management Endpoints
**Description:** As a super admin, I want to manage tenants so that I can onboard and control organizations.

**Acceptance Criteria:**
- [ ] `GET /api/v2/admin/tenants` - List all tenants (super admin only)
- [ ] `POST /api/v2/admin/tenants` - Create new tenant
- [ ] `GET /api/v2/admin/tenants/:id` - Get tenant details
- [ ] `PATCH /api/v2/admin/tenants/:id` - Update tenant (status, plan, quotas)
- [ ] `DELETE /api/v2/admin/tenants/:id` - Suspend/delete tenant
- [ ] Super admin authentication via special API key scope
- [ ] Typecheck passes

---

### US-013: Rate Limiting
**Description:** As the system, I need to enforce rate limits so that the API is protected from abuse.

**Acceptance Criteria:**
- [ ] Default rate limit: 100 requests per minute
- [ ] Auth endpoints: 10 requests per minute
- [ ] Execution create: 20 requests per minute
- [ ] Rate limit headers included in responses (X-RateLimit-*)
- [ ] 429 response with clear error message when exceeded
- [ ] Limits applied per API key
- [ ] Typecheck passes

---

### US-014: Error Handling
**Description:** As a developer, I want consistent error responses so that I can handle failures appropriately.

**Acceptance Criteria:**
- [ ] Global error handler plugin catches all errors
- [ ] Standard error format: `{ statusCode, error, message, details }`
- [ ] Validation errors return 400 with field-level details
- [ ] Auth errors return 401/403 with clear messages
- [ ] Not found errors return 404
- [ ] Rate limit errors return 429
- [ ] Unhandled errors return 500 without leaking internals
- [ ] Typecheck passes

---

### US-015: Health & Readiness Checks
**Description:** As an operator, I want health check endpoints so that I can monitor service status.

**Acceptance Criteria:**
- [ ] `GET /api/v2/health` - Basic liveness check
- [ ] `GET /api/v2/health/ready` - Readiness check (DB connectivity)
- [ ] Health endpoints exempt from authentication
- [ ] Response includes version, uptime, dependencies status
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** All endpoints prefixed with `/api/v2`
- **FR-2:** All endpoints (except health) require valid API key authentication
- **FR-3:** Tenant context derived from API key and injected into request
- **FR-4:** All database operations scoped to authenticated tenant's database
- **FR-5:** Request/response bodies use JSON format
- **FR-6:** Pagination supported via `limit` and `offset` query parameters
- **FR-7:** Filtering supported via query parameters per endpoint
- **FR-8:** All timestamps in ISO 8601 format (UTC)
- **FR-9:** IDs use UUID v4 format
- **FR-10:** API keys never logged or returned after creation

---

## Non-Goals

- OAuth2 authentication (deferred to Phase 3)
- SSE real-time events (Phase 2)
- File upload/download for artifacts (Phase 2)
- GitHub OAuth provider (Phase 3)
- OpenAPI/Swagger documentation (Phase 3)
- Docker configuration (Phase 3)
- Metrics/observability endpoints (Phase 3)
- Webhook support (out of scope)

---

## Technical Considerations

### Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| bun | 1.3.5 | Runtime |
| fastify | ^4.25.2 | HTTP framework |
| @fastify/cors | ^8.5.0 | CORS handling |
| @fastify/env | ^4.3.0 | Environment configuration |
| @fastify/rate-limit | ^8.1.1 | Rate limiting |
| desiagent | local | Core agent library |
| bcrypt | latest | API key hashing |

### Database Strategy
- Central admin DB: `~/.desiAgent/admin.db` (tenants, super admin)
- Per-tenant DB: `~/.desiAgent/tenants/{tenant_id}/agent.db`
- No changes to desiAgent library required

### Project Structure
```
src/
├── server.ts              # Entry point
├── app.ts                 # Fastify app setup
├── config/env.ts          # Environment schema
├── plugins/
│   ├── auth.ts            # API key auth plugin
│   ├── tenant.ts          # Tenant context plugin
│   └── error-handler.ts   # Global error handling
├── routes/v2/             # All route handlers
├── services/
│   ├── tenant-client.ts   # Per-tenant desiAgent client
│   ├── api-key.ts         # API key management
│   ├── admin.ts           # Tenant management
│   └── billing.ts         # Usage tracking
├── middleware/
│   ├── authenticate.ts    # Auth middleware
│   └── validate.ts        # Request validation
├── db/
│   ├── admin-schema.ts    # Central admin DB
│   ├── user-schema.ts     # Per-tenant users
│   └── billing-schema.ts  # Usage & billing
├── types/fastify.d.ts     # Type extensions
└── utils/                 # Helpers
```

---

## Success Metrics

- All CRUD operations for agents, DAGs, executions work correctly
- API key authentication secures all protected endpoints
- Rate limiting prevents abuse without impacting normal usage
- Error responses are consistent and actionable
- Health checks enable monitoring integration
- Billing tracks all execution costs accurately

---

## Open Questions

- Should we implement request logging in Phase 1 or defer?
- What is the API key expiration policy?
- Should tenant quotas be enforced at API layer or just tracked?
- How should super admin API keys be bootstrapped initially?
