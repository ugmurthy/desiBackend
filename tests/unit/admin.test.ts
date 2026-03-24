import { describe, it, expect, beforeEach, vi } from "vitest";
import { ensureAdminDb } from "../helpers";

vi.mock("../../src/db/user-schema", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/db/user-schema")>();
  return {
    ...original,
    initializeTenantUserSchema: vi.fn(async (_tenantId: string) => {
      const { Database } = await import("bun:sqlite");
      const db = new Database(":memory:");
      original.initializeUserSchema(db);
      return db;
    }),
  };
});

import {
  createTenant,
  getTenant,
  getTenantBySlug,
  updateTenant,
  listTenants,
  deleteTenant,
  suspendTenant,
  activateTenant,
} from "../../src/services/admin";
import { getAdminDatabase } from "../../src/db/admin-schema";

describe("admin service", () => {
  beforeEach(() => {
    ensureAdminDb();
    // Clear tenants for isolation
    const db = getAdminDatabase();
    db.exec("DELETE FROM tenants");
  });

  it("createTenant creates a tenant with correct defaults", async () => {
    const tenant = await createTenant({
      name: "Test Org",
      slug: "test-org",
    });

    expect(tenant.id).toBeTruthy();
    expect(tenant.name).toBe("Test Org");
    expect(tenant.slug).toBe("test-org");
    expect(tenant.status).toBe("active");
    expect(tenant.plan).toBe("free");
    expect(tenant.createdAt).toBeTruthy();
    expect(tenant.updatedAt).toBeTruthy();
  });

  it("getTenant retrieves existing tenant", async () => {
    const created = await createTenant({
      name: "Retrieve Me",
      slug: "retrieve-me",
    });

    const found = getTenant(created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Retrieve Me");
    expect(found!.slug).toBe("retrieve-me");
  });

  it("getTenantBySlug retrieves by slug", async () => {
    await createTenant({ name: "By Slug", slug: "by-slug" });

    const found = getTenantBySlug("by-slug");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("By Slug");
  });

  it("updateTenant updates fields", async () => {
    const tenant = await createTenant({
      name: "Before Update",
      slug: "update-test",
    });

    const updated = updateTenant(tenant.id, {
      name: "After Update",
      plan: "pro",
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("After Update");
    expect(updated!.plan).toBe("pro");
  });

  it("listTenants returns all tenants", async () => {
    await createTenant({ name: "T1", slug: "t1" });
    await createTenant({ name: "T2", slug: "t2" });

    const result = listTenants();
    expect(result.tenants.length).toBe(2);
    expect(result.total).toBe(2);
  });

  it("listTenants filters by status", async () => {
    const t1 = await createTenant({ name: "Active", slug: "active-one" });
    const t2 = await createTenant({
      name: "To Suspend",
      slug: "suspend-one",
    });
    suspendTenant(t2.id);

    const activeOnly = listTenants({ status: "active" });
    expect(activeOnly.tenants.length).toBe(1);
    expect(activeOnly.tenants[0].slug).toBe("active-one");

    const suspendedOnly = listTenants({ status: "suspended" });
    expect(suspendedOnly.tenants.length).toBe(1);
    expect(suspendedOnly.tenants[0].slug).toBe("suspend-one");
  });

  it("deleteTenant removes tenant", async () => {
    const tenant = await createTenant({
      name: "Delete Me",
      slug: "delete-me",
    });

    const deleted = deleteTenant(tenant.id);
    expect(deleted).toBe(true);

    const found = getTenant(tenant.id);
    expect(found).toBeNull();
  });

  it("suspendTenant sets status to suspended", async () => {
    const tenant = await createTenant({
      name: "Suspend Me",
      slug: "suspend-me",
    });

    const suspended = suspendTenant(tenant.id);
    expect(suspended).not.toBeNull();
    expect(suspended!.status).toBe("suspended");
  });

  it("activateTenant sets status to active", async () => {
    const tenant = await createTenant({
      name: "Reactivate",
      slug: "reactivate",
    });
    suspendTenant(tenant.id);

    const activated = activateTenant(tenant.id);
    expect(activated).not.toBeNull();
    expect(activated!.status).toBe("active");
  });

  it("createTenant with duplicate slug throws", async () => {
    await createTenant({ name: "First", slug: "dupe-slug" });

    await expect(
      createTenant({ name: "Second", slug: "dupe-slug" })
    ).rejects.toThrow();
  });
});
