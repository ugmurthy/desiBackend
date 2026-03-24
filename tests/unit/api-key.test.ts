import { describe, it, expect, beforeEach, vi } from "vitest";
import { Database } from "bun:sqlite";
import { initializeApiKeySchema } from "../../src/db/api-key-schema";
import { initializeUserSchema } from "../../src/db/user-schema";

vi.mock("../../src/db/admin-schema", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/db/admin-schema")>();
  return {
    ...original,
    registerApiKeyTenantMapping: vi.fn(),
    removeApiKeyTenantMapping: vi.fn(),
  };
});

import {
  createApiKey,
  validateApiKey,
  listApiKeys,
  revokeApiKey,
} from "../../src/services/api-key";

const TEST_TENANT_ID = "api-key-test-tenant";
const TEST_USER_ID = "api-key-test-user";

let db: Database;

describe("api-key service", () => {
  beforeEach(() => {
    db = new Database(":memory:");
    initializeUserSchema(db);
    initializeApiKeySchema(db);

    db.run(
      `INSERT INTO users (id, email, name, role, tenantId) VALUES (?, ?, ?, ?, ?)`,
      [TEST_USER_ID, "test@example.com", "Test User", "admin", TEST_TENANT_ID]
    );
  });

  it("createApiKey returns fullKey, keyPrefix, id, name, scopes", async () => {
    const result = await createApiKey(db, TEST_TENANT_ID, {
      userId: TEST_USER_ID,
      name: "my-key",
    });

    expect(result.id).toBeTruthy();
    expect(result.fullKey).toMatch(/^desi_sk_/);
    expect(result.keyPrefix).toBeTruthy();
    expect(result.name).toBe("my-key");
    expect(result.scopes).toEqual(["read", "write"]);
  });

  it("createApiKey default scopes are ['read', 'write']", async () => {
    const result = await createApiKey(db, TEST_TENANT_ID, {
      userId: TEST_USER_ID,
      name: "default-scopes",
    });

    expect(result.scopes).toEqual(["read", "write"]);
  });

  it("validateApiKey succeeds with correct key", async () => {
    const created = await createApiKey(db, TEST_TENANT_ID, {
      userId: TEST_USER_ID,
      name: "valid-key",
    });

    const result = await validateApiKey(db, created.fullKey);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.userId).toBe(TEST_USER_ID);
      expect(result.apiKey.id).toBe(created.id);
      expect(result.apiKey.name).toBe("valid-key");
    }
  });

  it("validateApiKey fails with wrong key", async () => {
    await createApiKey(db, TEST_TENANT_ID, {
      userId: TEST_USER_ID,
      name: "some-key",
    });

    const result = await validateApiKey(db, "desi_sk_live_invalid_key_value");

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Invalid API key");
    }
  });

  it("validateApiKey fails with expired key", async () => {
    const pastDate = new Date("2020-01-01T00:00:00.000Z");
    const created = await createApiKey(db, TEST_TENANT_ID, {
      userId: TEST_USER_ID,
      name: "expired-key",
      expiresAt: pastDate,
    });

    const result = await validateApiKey(db, created.fullKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("API key has expired");
    }
  });

  it("listApiKeys returns keys for user", async () => {
    await createApiKey(db, TEST_TENANT_ID, {
      userId: TEST_USER_ID,
      name: "key-1",
    });
    await createApiKey(db, TEST_TENANT_ID, {
      userId: TEST_USER_ID,
      name: "key-2",
    });

    const keys = listApiKeys(db, TEST_USER_ID);

    expect(keys.length).toBe(2);
    const names = keys.map((k) => k.name);
    expect(names).toContain("key-1");
    expect(names).toContain("key-2");
  });

  it("revokeApiKey deletes the key and returns true", async () => {
    const created = await createApiKey(db, TEST_TENANT_ID, {
      userId: TEST_USER_ID,
      name: "revoke-me",
    });

    const revoked = revokeApiKey(db, created.id, TEST_USER_ID);
    expect(revoked).toBe(true);

    const keys = listApiKeys(db, TEST_USER_ID);
    expect(keys.length).toBe(0);
  });

  it("revokeApiKey returns false for non-existent key", () => {
    const result = revokeApiKey(db, "non-existent-id", TEST_USER_ID);
    expect(result).toBe(false);
  });
});
