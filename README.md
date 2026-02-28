# desiBackend

Backend API for the desiAgent multi-tenant agent orchestration system. Built with [Fastify](https://fastify.dev) and [Bun](https://bun.sh), it provides a REST API (v2) for managing tenants, users, AI agents, DAG-based workflows, executions, and cost tracking.

## Prerequisites

- [Bun](https://bun.sh) v1.3.5+
- [sqlite3](https://www.sqlite.org/) CLI (used by setup scripts)
- The `@ugm/desiagent` package (local dependency at `../desiAgent`)

## Installation

```bash
git clone https://github.com/ugmurthy/desibackend.git
cd desibackend
bun install
```

## Configuration

Create a `.env` file in the project root:

```env
# Required
PORT=3000

# Server
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info            # debug | info | warn | error

# LLM Provider
LLM_PROVIDER=openai       # openai | openrouter | ollama
LLM_MODEL=gpt-4o-mini

# Provider API Keys (set the one matching LLM_PROVIDER)
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
OLLAMA_BASE_URL=http://localhost:11434

# URLs
BASE_URL=http://localhost:3000
FRONTEND_BASE_URL=http://localhost:5173

# Override default super admin credentials during bootstrap
ADMIN_EMAIL=admin@example.com
ADMIN_NAME=Super Admin
```

## Initialization

Bootstrap creates the `~/.desiAgent/` directory structure, the admin database, seed files, and a default tenant.

```bash
bun run bootstrap-admin
# or
bun run scripts/bootstrap.ts
```

Re-run with `--force` to update existing admin/tenant data without deleting records:

```bash
bun run scripts/bootstrap.ts --force
```

See [init_desiAgent.md](init_desiAgent.md) for details.

## Running the Server

```bash
# Development (auto-reload on changes)
bun run dev

# Production
bun run start
```

The server starts at `http://localhost:3000` by default.

## Getting Started

### 1. Bootstrap the system

```bash
bun run bootstrap-admin
```

This creates the admin API key at `~/.desiAgent/admin-key.txt`.

### 2. Create a tenant

```bash
bash scripts/01-create-tenant.sh myorg free
# Arguments: <name> [plan: free|pro|enterprise]
```

### 3. Create a user with an API key

```bash
bash scripts/02-create-user.sh user@example.com "My User" myorg member
# Arguments: <email> <name> <tenant_name> [role: admin|member|viewer]
```

The script outputs the API key and saves it to `~/.desiAgent/<tenant>-<name>-<role>.txt`.

### 4. Use the API

Set your API key and start making requests:

```bash
export API_KEY=$(cat ~/.desiAgent/myorg-My\ User-member.txt)
```

## Authentication

All API endpoints (except `/health`) require a Bearer token:

```
Authorization: Bearer <api_key>
```

There are two types of API keys:

| Type | Prefix | Purpose |
|------|--------|---------|
| Admin | `desi_sk_admin_...` | Super admin operations (tenant CRUD). Created during bootstrap. |
| Tenant | `desi_sk_...` | Regular API access (DAGs, executions, agents). Created per-user. |

## API Reference

Base URL: `http://localhost:3000/api/v2`

Interactive API docs (Scalar/Swagger) are available at:
- **UI**: `http://localhost:3000/api/v2/docs`
- **OpenAPI JSON**: `http://localhost:3000/api/v2/docs/json`
- **OpenAPI YAML**: `http://localhost:3000/api/v2/docs/yaml`

### Endpoints Overview

| Group | Method | Endpoint | Description |
|-------|--------|----------|-------------|
| **Health** | GET | `/health` | Health check |
| | GET | `/health/ready` | Readiness check (DB connectivity) |
| **Auth** | GET | `/auth/me` | Get current user profile |
| | POST | `/auth/login` | Login with email/password |
| | POST | `/auth/logout` | End session |
| | POST | `/auth/register/:tenantSlug` | Self-register for a tenant |
| | POST | `/auth/invite` | Invite a user (admin) |
| | POST | `/auth/accept-invite/:token` | Accept an invite |
| | GET | `/auth/api-keys` | List your API keys |
| | POST | `/auth/api-keys` | Create a new API key |
| | DELETE | `/auth/api-keys/:id` | Revoke an API key |
| **Users** | GET | `/users` | List tenant users (admin) |
| **Agents** | POST | `/agents` | Create an agent |
| | GET | `/agents` | List agents |
| | GET | `/agents/:id` | Get agent details |
| | PATCH | `/agents/:id` | Update an agent |
| | DELETE | `/agents/:id` | Delete an agent |
| | POST | `/agents/:id/activate` | Set as active version |
| | GET | `/agents/resolve/:name` | Resolve active agent by name |
| **DAGs** | POST | `/dags` | Create a DAG from a goal |
| | GET | `/dags` | List DAGs |
| | GET | `/dags/:id` | Get DAG details |
| | PATCH | `/dags/:id` | Update a DAG |
| | POST | `/dags/:id/execute` | Execute a DAG |
| **Executions** | GET | `/executions` | List executions |
| | GET | `/executions/:id` | Get execution details |
| | GET | `/executions/:id/steps` | Get execution steps |
| | POST | `/executions/:id/resume` | Resume a paused execution |
| | GET | `/executions/:id/events` | Stream events (SSE) |
| **Artifacts** | GET | `/artifacts` | List/retrieve execution artifacts |
| **Tools** | GET | `/tools` | List available tools |
| **Costs** | GET | `/costs/summary/me` | Personal cost summary |
| | GET | `/costs/executions/:id` | Cost breakdown per execution |
| **Billing** | GET | `/billing/usage` | Current billing period usage |
| | GET | `/billing/invoices` | Invoice history |
| **Admin** | GET | `/admin/tenants` | List tenants |
| | POST | `/admin/tenants` | Create a tenant |
| | GET | `/admin/tenants/:id` | Get tenant details |
| | PATCH | `/admin/tenants/:id` | Update a tenant |
| | DELETE | `/admin/tenants/:id` | Delete/suspend a tenant |

## Usage Examples

All examples assume `$API_KEY` is set to a valid tenant API key.

### Health Check

```bash
curl http://localhost:3000/api/v2/health
```

### Create a DAG

```bash
curl -X POST http://localhost:3000/api/v2/dags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "goalText": "Summarize the latest news about AI",
    "agentName": "DecomposerV8"
  }'
```

Optional fields: `provider`, `model`, `temperature`, `maxTokens`, `seed`, `cronSchedule`, `scheduleActive`, `timezone`.

### List DAGs

```bash
curl http://localhost:3000/api/v2/dags \
  -H "Authorization: Bearer $API_KEY"
```

### Execute a DAG

```bash
curl -X POST http://localhost:3000/api/v2/dags/{dag_id}/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{}'
```

Optionally override `provider` and `model` in the body.

### List Executions

```bash
curl http://localhost:3000/api/v2/executions \
  -H "Authorization: Bearer $API_KEY"
```

### List Agents

```bash
curl http://localhost:3000/api/v2/agents \
  -H "Authorization: Bearer $API_KEY"
```

### List Tools

```bash
curl http://localhost:3000/api/v2/tools \
  -H "Authorization: Bearer $API_KEY"
```

### Cost Summary

```bash
curl http://localhost:3000/api/v2/costs/summary/me \
  -H "Authorization: Bearer $API_KEY"
```

### Create an API Key

```bash
curl -X POST http://localhost:3000/api/v2/auth/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "name": "CI/CD Key",
    "scopes": ["read", "write"]
  }'
```

### Admin: Create a Tenant

Requires the admin API key from `~/.desiAgent/admin-key.txt`:

```bash
ADMIN_KEY=$(cat ~/.desiAgent/admin-key.txt)
curl -X POST http://localhost:3000/api/v2/admin/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme",
    "plan": "pro"
  }'
```

## Project Structure

```
desiBackend/
├── src/
│   ├── config/         # Environment schema & types
│   ├── db/             # Database schemas & queries
│   ├── middleware/      # Auth middleware
│   ├── plugins/        # Fastify plugins (error handler)
│   ├── routes/v2/      # All API route handlers
│   ├── services/       # Business logic (bootstrap, tenant client)
│   ├── types/          # Shared TypeScript types
│   ├── utils/          # Utility functions
│   ├── app.ts          # Fastify app builder
│   └── index.ts        # Entry point
├── scripts/            # Admin & utility shell scripts
├── docs/               # Documentation
├── artifacts/          # Generated artifacts
└── package.json

~/.desiAgent/             # Runtime data (created by bootstrap)
├── admin.db              # Admin database (tenants, super admins)
├── admin-key.txt         # Super admin API key
├── seed/                 # Agent seed files
└── tenants/
    └── <tenant_id>/
        └── agent.db      # Per-tenant database (users, keys, DAGs)
```

## Scripts Reference

| Script | Description |
|--------|-------------|
| `scripts/bootstrap.ts` | Initialize admin DB, default tenant, and admin key |
| `scripts/01-create-tenant.sh` | Create a new tenant |
| `scripts/02-create-user.sh` | Create a user with API key in a tenant |
| `scripts/03-list-tenants.sh` | List all tenants |
| `scripts/create-api-key.ts` | Generate an API key (used by other scripts) |
| `scripts/migrate-ownership.ts` | Run ownership migration |

## Rate Limiting

- **Global**: 100 requests per minute per API key (or IP if unauthenticated)
- **DAG Execution**: 20 requests per minute

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` (when limit exceeded)

## Development

```bash
# Type checking
bun run typecheck
```
