# desiBackend

Backend API for the desiAgent multi-tenant agent orchestration system. Built with [Fastify](https://fastify.dev) and [Bun](https://bun.sh), it provides a REST API (v2) for managing tenants, users, AI agents, DAG-based workflows, executions, cost tracking, and Telegram bot integration.

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
AUTO_START_SCHEDULER=true # set false to disable DAG scheduler startup

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

# Telegram Bot (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_DEFAULT_TENANT_ID=default
TELEGRAM_POLL_INTERVAL_MS=5000
TELEGRAM_POLL_TIMEOUT_MS=300000
TELEGRAM_WEBHOOK_SECRET=

# Agent
DEFAULT_AGENT_NAME=DecomposerV9

# Data directory override (optional)
DESI_DATA_DIR=
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
| | POST | `/auth/register/:tenantSlug` | Self-register for a tenant |
| | GET | `/auth/verify-email/:token` | Verify email address |
| | POST | `/auth/resend-verification/:tenantSlug` | Resend verification email |
| | POST | `/auth/login/:tenantSlug` | Login with email/password |
| | POST | `/auth/logout` | End session |
| | POST | `/auth/forgot-password/:tenantSlug` | Request password reset |
| | POST | `/auth/reset-password` | Reset password with token |
| | POST | `/auth/invite` | Invite a user (admin) |
| | POST | `/auth/accept-invite/:token` | Accept an invite |
| | GET | `/auth/api-keys` | List your API keys |
| | POST | `/auth/api-keys` | Create a new API key |
| | DELETE | `/auth/api-keys/:id` | Revoke an API key |
| **Users** | GET | `/users` | List tenant users (admin) |
| | GET | `/users/:id` | Get user details (admin) |
| | PATCH | `/users/:id` | Update a user (admin) |
| | DELETE | `/users/:id` | Delete a user (admin) |
| | POST | `/users/invite` | Invite a user (admin) |
| **Agents** | POST | `/agents` | Create an agent |
| | GET | `/agents` | List agents |
| | GET | `/agents/:id` | Get agent details |
| | PATCH | `/agents/:id` | Update an agent |
| | DELETE | `/agents/:id` | Delete an agent |
| | POST | `/agents/:id/activate` | Set as active version |
| | GET | `/agents/resolve/:name` | Resolve active agent by name |
| **DAGs** | POST | `/dags` | Create a DAG from a goal |
| | POST | `/create-execute` | Create DAG and execute in one step |
| | GET | `/dags` | List DAGs |
| | GET | `/dags/scheduled` | List scheduled DAGs |
| | POST | `/dags/scheduled` | Manage scheduled DAG actions |
| | POST | `/dags/experiments` | Run experiments with multiple models/temperatures |
| | GET | `/dags/:id` | Get DAG details |
| | PATCH | `/dags/:id` | Update a DAG |
| | DELETE | `/dags/:id` | Delete a DAG |
| | POST | `/dags/:id/execute` | Execute a DAG |
| | POST | `/dags/:id/resume-clarification` | Resume after clarification |
| **Executions** | GET | `/executions` | List executions |
| | GET | `/executions/:id` | Get execution details |
| | GET | `/executions/:id/details` | Get detailed execution info |
| | GET | `/executions/:id/sub-steps` | Get execution sub-steps |
| | DELETE | `/executions/:id` | Delete an execution |
| | GET | `/executions/:id/events` | Stream events (SSE) |
| | POST | `/executions/:id/resume` | Resume a paused execution |
| **Artifacts** | GET | `/artifacts` | List execution artifacts |
| | GET | `/artifacts/:path` | Get a specific artifact file |
| **Skills** | GET | `/skills` | List available skills (admin) |
| | GET | `/skill/:skillname` | Get skill spec (admin) |
| **Tools** | GET | `/tools` | List available tools |
| **Costs** | GET | `/costs/summary` | Cost summary (admin) |
| | GET | `/costs/summary/me` | Personal cost summary |
| | GET | `/costs/executions/:id` | Cost breakdown per execution |
| | GET | `/costs/dags/:id` | Cost breakdown per DAG |
| **Billing** | GET | `/billing/usage` | Current billing period usage |
| | GET | `/billing/usage/history` | Usage history |
| | GET | `/billing/invoices` | Invoice history |
| | GET | `/billing/invoices/:id` | Get invoice details |
| **Telegram** | POST | `/telegram/webhook` | Telegram bot webhook |
| | GET | `/telegram/download/:token` | Download artifact via signed token |
| **Admin** | GET | `/admin/tenants` | List tenants |
| | POST | `/admin/tenants` | Create a tenant |
| | GET | `/admin/tenants/:id` | Get tenant details |
| | PATCH | `/admin/tenants/:id` | Update a tenant |
| | DELETE | `/admin/tenants/:id` | Delete/suspend a tenant |
| | POST | `/admin/bootstrap/:tenant` | Bootstrap a tenant |

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
│   ├── services/       # Business logic (bootstrap, tenant client, telegram)
│   ├── types/          # Shared TypeScript types
│   ├── utils/          # Utility functions
│   ├── app.ts          # Fastify app builder
│   └── index.ts        # Entry point
├── scripts/            # Admin & utility shell scripts
├── tests/              # Unit, integration & middleware tests
├── desiClient/         # TypeScript SDK client
├── desiClientPy/       # Python SDK client
├── docs/               # Documentation
├── tasks/              # PRDs and progress tracking
├── artifacts/          # Generated artifacts
└── package.json

~/.desiAgent/             # Runtime data (created by bootstrap)
├── admin.db              # Admin database (tenants, super admins)
├── admin-key.txt         # Super admin API key
├── seed/                 # Agent seed files
└── tenants/
    └── <tenant_id>/
        ├── agent.db      # Per-tenant database (users, keys, DAGs)
        └── artifacts/    # Execution artifacts
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
| `scripts/XX-delete-tenant.sh` | Delete a tenant |

## Rate Limiting

- **Global**: 100 requests per minute per API key (or IP if unauthenticated)
- **DAG Execution**: 20 requests per minute

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` (when limit exceeded)

## Docker

### Build the Docker image

```bash
docker build -t desibackend .
```

### Run locally with Docker

```bash
docker run -p 3000:3000 \
  --env-file .env \
  -v ~/.desiAgent:/data/.desiAgent \
  desibackend
```

### Run with Docker Compose

```bash
docker compose up --build
```

To run in the background:

```bash
docker compose up --build -d
```

### Verify it's running

```bash
curl http://localhost:3000/api/v2/health
```

> **Note:** The container expects the `~/.desiAgent` data directory to be mounted at `/data/.desiAgent`. Run `bun run bootstrap-admin` on the host first to create the required directory structure and admin database before starting the container.

## Development

```bash
# Type checking
bun run typecheck

# Run tests
bun run test

# Run tests in watch mode
bun run test:watch
```
