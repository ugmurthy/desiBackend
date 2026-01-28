# Initializing desiAgent

## Prerequisites

- [Bun](https://bun.sh) installed
- Dependencies installed: `bun install`

## Quick Start

```bash
bun run scripts/bootstrap.ts
```

This creates the `~/.desiAgent/` directory structure and initializes all databases.

## What Gets Created

| Component | Location |
|-----------|----------|
| Admin database | `~/.desiAgent/admin.db` |
| Seed files | `~/.desiAgent/seed/` |
| Tenant databases | `~/.desiAgent/tenants/<tenant>/agent.db` |

## Force Mode

To re-initialize and update existing data:

```bash
bun run scripts/bootstrap.ts --force
```

**Note:** Force mode updates super admin, API key, and default tenant but does not delete existing data.

## Idempotent

Safe to run multiple times—existing tables and records are preserved.
