# desiBackend

Backend API for the desiAgent multi-tenant agent orchestration system.

## Prerequisites

- [Bun](https://bun.sh) v1.3.5+

## Installation

```bash
bun install
```

## Configuration

Create a `.env` file in the project root:

```env
# Required
PORT=3000

# Optional
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info

# Optional: Override default super admin credentials during bootstrap
ADMIN_EMAIL=admin@example.com
ADMIN_NAME=Super Admin
```

## Initialization

Before running the server, initialize the desiAgent system:

```bash
bun run scripts/bootstrap.ts
```

See [init_desiAgent.md](init_desiAgent.md) for detailed bootstrap instructions.

## Running the Server

```bash
bun run src/index.ts
```

## User & API Key Setup

The system uses two types of API keys:

1. **Admin API Key** (`desi_sk_admin_...`) - For super admin operations (tenant management). Created during bootstrap and saved to `~/.desiAgent/admin-key.txt`.

2. **Tenant API Keys** (`desi_sk_...`) - For regular API access (DAGs, executions). Created per-user within a tenant.

### Setting Up the First User

After bootstrap, you need to create a user and generate their API key. Use the provided setup script:

```bash
bun run scripts/setup-user.ts --email admin@example.com --name "Admin User" --role admin
```

This creates a user in the default tenant and outputs their API key. Save this key for API calls.

## API Examples

All endpoints require authentication via `Authorization: Bearer <api_key>` (tenant API key).

### Invite a User (requires admin role)

```bash
curl -X POST http://localhost:3000/api/v2/users/invite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "role": "member"
  }'
```

### Create an API Key for a User

Once authenticated, a user can create additional API keys:

```bash
curl -X POST http://localhost:3000/api/v2/auth/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -d '{
    "name": "CI/CD Key",
    "scopes": ["read", "write"]
  }'
```

### Create a DAG

```bash
curl -X POST http://localhost:3000/api/v2/dags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -d '{
    "goalText": "Summarize the latest news about AI",
    "agentName": "summarizer",
    "provider": "openai",
    "model": "gpt-4"
  }'
```

### Execute a DAG

```bash
curl -X POST http://localhost:3000/api/v2/dags/{dag_id}/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -d '{
    "provider": "openai",
    "model": "gpt-4"
  }'
```

### Execute a DAG Definition (ad-hoc)

```bash
curl -X POST http://localhost:3000/api/v2/dags/execute-definition \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -d '{
    "originalGoalText": "Fetch and summarize weather data",
    "definition": {
      "nodes": [...],
      "edges": [...]
    }
  }'
```

## Project Structure

```
~/.desiAgent/
├── admin.db          # Admin database (tenants, super admins, agents)
├── seed/             # Agent seed files
└── tenants/
    └── <tenant>/
        └── agent.db  # Per-tenant database (users, api keys, dags)
```
