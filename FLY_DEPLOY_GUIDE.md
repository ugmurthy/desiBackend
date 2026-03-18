# Fly.io Deployment Guide

## Final Recommendation

For this codebase, the production-safe recommendation is:

1. Run SQLite on one Fly machine with one attached volume.
2. Keep automated backups/snapshots enabled for that volume.
3. Do not run two independent machines against SQLite without replication.

### Why

This app stores data as:

- `admin.db` at `.desiAgent/admin.db`
- one tenant DB per directory at `.desiAgent/tenants/<tenant_id>/agent.db`

If two machines run without replication, each machine writes to its own local volume and your data splits.

LiteFS is Fly's SQLite replication option, but LiteFS currently does not support subdirectories for SQLite files inside the mounted path. This app's per-tenant DB layout uses subdirectories, so LiteFS is not drop-in with the current layout.

## Current Production Runbook (Recommended Now)

### 1. Prerequisites

```bash
brew install flyctl
fly auth login
```

### 2. Ensure App Exists

```bash
fly apps show desibackend || fly apps create desibackend
```

### 3. Create One Volume

```bash
fly volumes create desiData -a desibackend -r sin -s 20 -n 1 -y
fly volumes list -a desibackend
```

### 4. Set Secrets

```bash
fly secrets set -a desibackend \
  OPENAI_API_KEY=... \
  OPENROUTER_API_KEY=... \
  LLM_PROVIDER=openai \
  LLM_MODEL=gpt-4o-mini \
  BASE_URL=https://desibackend.fly.dev \
  FRONTEND_BASE_URL=https://your-frontend.example.com \
  TELEGRAM_BOT_TOKEN=... \
  TELEGRAM_WEBHOOK_SECRET=...
```

Set only the provider key you actually use.

### 5. Deploy

```bash
fly deploy -a desibackend
```

### 6. Bootstrap Data On Volume

```bash
fly ssh console -a desibackend -C "cd /app && bun run scripts/bootstrap.ts --force"
```

### 7. Keep One Machine Always On

Set this in `fly.toml`:

```toml
[http_service]
auto_stop_machines = "off"
min_machines_running = 1
```

Redeploy:

```bash
fly deploy -a desibackend
```

### 8. Verify

```bash
fly status -a desibackend
fly machine list -a desibackend
fly logs -a desibackend
curl https://desibackend.fly.dev/api/v2/health/ready
```

## If You Must Run Two Machines With SQLite

You need an architecture change first:

1. Move DB files to a LiteFS-compatible layout (root-level SQLite files, no nested tenant subdirectories).
2. Add LiteFS + Consul lease configuration.
3. Disable autostop/autostart for LiteFS deployments.
4. Run two machines with one volume per machine and LiteFS replication.

Until step 1 is complete in this repository, do not scale this app to two SQLite-backed machines.

## Data Paths Used By This App

| Purpose | Path |
|---|---|
| Base data directory | `${DESI_DATA_DIR}/.desiAgent` |
| Admin DB | `${DESI_DATA_DIR}/.desiAgent/admin.db` |
| Tenant DBs | `${DESI_DATA_DIR}/.desiAgent/tenants/<tenant_id>/agent.db` |
| Seed files | `${DESI_DATA_DIR}/.desiAgent/seed/` |
| Admin key | `${DESI_DATA_DIR}/.desiAgent/admin-key.txt` |

On Fly, `DESI_DATA_DIR` should be `/data` (already set in `fly.toml`).

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | If using OpenAI | `""` | OpenAI API key |
| `OPENROUTER_API_KEY` | If using OpenRouter | `""` | OpenRouter API key |
| `TELEGRAM_BOT_TOKEN` | Telegram only | `""` | Bot token |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook only | `""` | Webhook verification secret |
| `LLM_PROVIDER` | No | `openai` | `openai`, `openrouter`, or `ollama` |
| `LLM_MODEL` | No | `gpt-4o-mini` | Model name |
| `AUTO_START_SCHEDULER` | No | `true` | Start DAG scheduler on backend startup; set `false` to disable |
| `BASE_URL` | No | `http://localhost:3000` | Backend public URL |
| `FRONTEND_BASE_URL` | No | `http://localhost:5173` | Frontend URL for CORS |
| `DESI_DATA_DIR` | Yes on Fly | `""` | Set to `/data` on Fly |
