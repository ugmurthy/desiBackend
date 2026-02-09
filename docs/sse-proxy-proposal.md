# Proposal: SSE Proxy Route for `/executions/:id/events`

## Problem

The browser's `EventSource` API does not support custom headers. This means clients cannot send `Authorization: Bearer <token>` when connecting to the SSE endpoint at `GET /api/v2/executions/:id/events`.

## Solution: Token-in-Query-String Proxy Route

Add a new **unauthenticated** route that accepts the token as a query parameter, validates it server-side, then internally calls the existing authenticated SSE handler to stream events back.

## Flow

```
Browser (EventSource)
    |
    |  GET /api/v2/executions/:id/events/stream?token=desi_sk_...
    v
Proxy Route
    |-- Extract token from query string
    |-- Inject token into Authorization header
    |-- Call authenticate middleware
    v
authenticate middleware
    |-- Validates token (API key or session)
    |-- Returns AuthContext (tenant, user, tenantDb)
    v
Stream SSE (reuses existing streamEvents logic)
    |
    |  data: {...}\n\n
    v
Browser
```

## Implementation Details

**New route:** `GET /api/v2/executions/:id/events/stream?token=<bearer_token>`

Located in `src/routes/v2/executions.ts`:

```typescript
fastify.get<{ Params: ExecutionIdParams; Querystring: { token: string } }>(
  "/executions/:id/events/stream",
  {
    schema: {
      tags: ["Executions"],
      summary: "SSE proxy - token via query string",
      description:
        "Proxy for EventSource clients that cannot set Authorization headers. " +
        "Pass the Bearer token as a ?token= query parameter.",
      params: executionIdParamSchema,
      querystring: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", description: "Bearer token (API key or session token)" },
        },
      },
      response: {
        200: { type: "string", description: "SSE event stream" },
        401: error401Schema,
        404: error404Schema,
      },
    },
  },
  async (request, reply) => {
    const { token } = request.query;

    // Inject token into the Authorization header so the existing
    // authenticate middleware logic can be reused
    request.headers.authorization = `Bearer ${token}`;

    // Run authentication manually
    await authenticate(request, reply);
    if (reply.sent) return; // auth failed, reply already sent

    const auth = (request as any).auth!;
    const { id } = request.params;

    const clientService = getTenantClientService();
    const client = await clientService.getClient(auth.tenant.id);

    // Verify execution exists
    try {
      await client.executions.get(id);
    } catch (error) {
      if (error instanceof Error && error.name === "NotFoundError") {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Execution not found",
        });
      }
      throw error;
    }

    // Stream SSE
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      for await (const event of client.executions.streamEvents(id)) {
        const data = JSON.stringify(event);
        reply.raw.write(`data: ${data}\n\n`);
      }
    } catch (error) {
      const errorData = JSON.stringify({
        error: "Stream error",
        message: (error as Error).message,
      });
      reply.raw.write(`event: error\ndata: ${errorData}\n\n`);
    } finally {
      reply.raw.end();
    }
  }
);
```

**Client usage:**

```javascript
const source = new EventSource(
  `/api/v2/executions/${executionId}/events/stream?token=${apiKey}`
);
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Query param `?token=`** | Only way to pass credentials with native `EventSource` |
| **Reuse `authenticate` middleware directly** | No code duplication; same auth logic for both routes |
| **Separate route path (`/events/stream`)** | Keeps the original `/events` route untouched; no breaking changes |
| **No `preHandler`** | Auth is called manually after injecting the token into the header |

## Security Considerations

- Tokens in URLs can appear in server access logs and browser history. Consider:
  - Setting Fastify logger to redact the `token` query param
  - Using HTTPS exclusively (tokens visible only to client + server)
  - Documenting that short-lived session tokens (`desi_session_*`) are preferred over long-lived API keys for browser SSE
