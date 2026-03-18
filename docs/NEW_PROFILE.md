# How to Introduce a New Telegram Profile

Profiles control how user goals sent via Telegram are processed. Each profile maps to a **handler** — a class that decides what happens when a user submits a goal (e.g., create a DAG, create and execute, or something custom).

## Architecture Overview

```
User sends message via Telegram
  → resolveProfileForIdentity()    # picks user's active profile or the default
  → resolveHandler(profileId)      # looks up the handler string from the DB
  → handlerRegistry.get(handler)   # returns the ProfileHandler instance
  → handler.handleRequest(...)     # processes the goal
```

**Key files:**

| File | Role |
|------|------|
| `src/services/telegram-profile-router.ts` | `ProfileHandler` interface, handler registry, profile resolution |
| `src/services/telegram-bot.ts` | Seed functions, command handling (`/profiles`, `/use`) |
| `src/routes/v2/telegram.ts` | Calls seed functions on startup |
| `src/db/telegram-schema.ts` | `ProfileRegistry` interface and DB schema |

## Step-by-Step Guide

### 1. Create the Handler

Create a new file in `src/services/` (e.g., `my-handler.ts`) that implements the `ProfileHandler` interface:

```ts
import { getTenantClientService } from "./tenant-client.js";
import type { ProfileHandler, ProfileHandlerResult } from "./telegram-profile-router.js";

export class MyHandler implements ProfileHandler {
  async handleRequest(params: {
    tenantId: string;
    userId: string;
    goalText: string;
    agentName?: string;
  }): Promise<ProfileHandlerResult> {
    const client = await getTenantClientService().getClient(params.tenantId);

    // --- Your custom logic here ---
    // Available client methods:
    //   client.dags.createFromGoal(...)       — create a DAG without executing
    //   client.dags.createAndExecuteFromGoal(...) — create + execute in one step
    //   client.dags.execute(dagId)           — execute an existing DAG
    //   client.dags.list(...)                — list DAGs
    //   client.dags.getById(dagId)           — fetch a DAG
    //   client.dags.resumeFromClarification(dagId, response)

    return {
      success: true,
      dagId: "...",
      executionId: "...",   // omit if not executing
      status: "...",
    };
  }

  async handleClarification(params: {
    tenantId: string;
    dagId: string;
    userResponse: string;
  }): Promise<ProfileHandlerResult> {
    const client = await getTenantClientService().getClient(params.tenantId);

    // Handle the clarification response and return result
    // ...

    return { success: true, dagId: params.dagId, status: "..." };
  }
}
```

The `ProfileHandlerResult` shape:

```ts
interface ProfileHandlerResult {
  success: boolean;
  dagId?: string;
  executionId?: string;
  status?: string;                // e.g., "created", "clarification_required", "validation_error"
  clarificationQuery?: string;    // question to send back to the user
  error?: string;
}
```

### File Attachments

When a user sends a document or photo via Telegram, it is passed to `handleRequest` as an optional `attachment`:

```ts
interface TelegramAttachment {
  fileId: string;       // Telegram file_id — use to download the file
  fileName?: string;    // original filename (documents only)
  mimeType?: string;    // e.g., "application/pdf" (documents only)
  fileSize?: number;    // size in bytes
}
```

To download the attached file inside your handler, use the `downloadTelegramFile` helper:

```ts
import { downloadTelegramFile } from "./telegram-bot.js";

// Inside handleRequest:
if (params.attachment) {
  const { localPath, fileName } = await downloadTelegramFile(
    botToken,           // you'll need to pass this in or access from env
    params.attachment.fileId,
    "/path/to/save/dir"
  );
  // localPath is now the downloaded file on disk
}
```

> **Note:** Telegram supports documents (any file type) and photos. Photos arrive without `fileName`/`mimeType` — only `fileId` and `fileSize` are available. The `caption` on the message is used as `goalText` when there is no `text`.

> **Tip:** See `src/services/example-profile-handler.ts` for a working reference implementation.

### 2. Register the Handler

In `src/services/telegram-profile-router.ts`, import your handler and add it to the registry:

```ts
import { MyHandler } from "./my-handler.js";

// In the handler registry section:
handlerRegistry.set("my-handler-key", new MyHandler());
```

The string key (`"my-handler-key"`) is what connects the DB row to your code.

### 3. Add a Seed Function

In `src/services/telegram-bot.ts`, add a seed function following the existing pattern:

```ts
export function seedMyProfile(): void {
  const adminDb = getAdminDatabase();
  const existing = adminDb
    .prepare(`SELECT id FROM profile_registry WHERE name = 'my-profile'`)
    .get();
  if (existing) return;

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  adminDb
    .prepare(
      `INSERT INTO profile_registry (id, name, description, handler, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      id,
      "my-profile",        // name users will see and use with /use
      "Description of what this profile does",
      "my-handler-key",    // must match the handlerRegistry key from step 2
      now,
      now
    );
}
```

### 4. Call the Seed on Startup

In `src/routes/v2/telegram.ts`, import and call the seed function:

```ts
import {
  handleTelegramUpdate,
  seedDefaultProfile,
  seedMyProfile,        // ← add
  type TelegramUpdate,
} from "../../services/telegram-bot";

const telegramRoutes: FastifyPluginAsync = async (fastify) => {
  seedDefaultProfile();
  seedMyProfile();       // ← add
  // ...
};
```

### 5. Restart and Use

After restarting the server, the profile is available. Users interact with it via Telegram:

| Command | Description |
|---------|-------------|
| `/profiles` | Lists all enabled profiles |
| `/use my-profile` | Switches the user's active profile |
| `/use default` | Switches back to the default profile |

## Checklist

- [ ] Handler file created implementing `ProfileHandler`
- [ ] Handler registered in `handlerRegistry` in `telegram-profile-router.ts`
- [ ] Seed function added in `telegram-bot.ts`
- [ ] Seed function exported and called in `telegram.ts` routes
- [ ] Server restarted
- [ ] Verified with `/profiles` in Telegram
