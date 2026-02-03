# Database Migrations

This project uses a simple migration system for schema changes. Migrations run automatically when databases are accessed.

## How It Works

| Database | Location | Runs When |
|----------|----------|-----------|
| Admin (`admin.db`) | `~/.desiAgent/admin.db` | Server startup / `initializeAdminDatabase()` |
| Tenant (`agent.db`) | `~/.desiAgent/tenants/{id}/agent.db` | Tenant access via API |

A `schema_version` table tracks applied migrations in each database.

## Adding a Migration

### Admin Database

Edit `src/db/migrations/admin/index.ts`:

```typescript
export const adminMigrations: Migration[] = [
  {
    version: 1,
    name: "add-feature-flags",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS feature_flags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  // Add next migration with version: 2, etc.
];
```

### Tenant Database

Edit `src/db/migrations/tenant/index.ts`:

```typescript
export const tenantMigrations: Migration[] = [
  {
    version: 1,
    name: "add-user-auth-columns",
    up: (db) => {
      // existing migration...
    },
  },
  {
    version: 2,
    name: "add-user-preferences",
    up: (db) => {
      db.exec(`ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'`);
    },
  },
];
```

## Migration Rules

1. **Version numbers must be unique and incrementing**
2. **Never modify existing migrations** — create a new one instead
3. **Migrations are irreversible** — no `down` function (backup before risky changes)
4. **Use `IF NOT EXISTS` / `IF EXISTS`** for safety where possible
5. **For ALTER TABLE**, check if column exists first (SQLite has no `ADD COLUMN IF NOT EXISTS`):

```typescript
{
  version: 3,
  name: "add-column-safely",
  up: (db) => {
    const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!cols.some(c => c.name === "newColumn")) {
      db.exec("ALTER TABLE users ADD COLUMN newColumn TEXT");
    }
  },
}
```

## Verifying Migrations

Check schema version:
```bash
sqlite3 ~/.desiAgent/admin.db "SELECT * FROM schema_version;"
sqlite3 ~/.desiAgent/tenants/default/agent.db "SELECT * FROM schema_version;"
```

Check table schema:
```bash
sqlite3 ~/.desiAgent/tenants/default/agent.db ".schema users"
```

## Forcing Re-run

Migrations only run once per version. To re-run:
1. Delete the row from `schema_version` table
2. Restart server / re-access tenant
