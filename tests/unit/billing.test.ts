import { describe, it, expect, beforeEach } from "vitest";
import { ensureAdminDb } from "../helpers";
import { initializeBillingSchema } from "../../src/db/billing-schema";
import {
  trackUsage,
  getUsage,
  getUsageSummary,
  trackExecutionUsage,
} from "../../src/services/billing";

const TEST_TENANT_ID = "billing-test-tenant";

describe("billing service", () => {
  beforeEach(() => {
    const db = ensureAdminDb();
    initializeBillingSchema(db);
    // Ensure tenant row exists (FK constraint)
    db.prepare(
      `INSERT OR IGNORE INTO tenants (id, name, slug, status, plan, quotas, createdAt, updatedAt)
       VALUES (?, 'Billing Test', 'billing-test', 'active', 'free', '{}', datetime('now'), datetime('now'))`
    ).run(TEST_TENANT_ID);
    // Clear previous usage records for isolation
    db.prepare(`DELETE FROM usage_records WHERE tenantId = ?`).run(TEST_TENANT_ID);
  });

  it("trackUsage creates a record with correct fields", () => {
    const record = trackUsage(TEST_TENANT_ID, "tokens", 1500, 0.003, {
      model: "gpt-4o",
    });

    expect(record.id).toBeTruthy();
    expect(record.tenantId).toBe(TEST_TENANT_ID);
    expect(record.resourceType).toBe("tokens");
    expect(record.quantity).toBe(1500);
    expect(record.unitCost).toBe(0.003);
    expect(record.timestamp).toBeTruthy();

    const meta = JSON.parse(record.metadata);
    expect(meta.model).toBe("gpt-4o");
  });

  it("getUsage returns records for a tenant", () => {
    trackUsage(TEST_TENANT_ID, "tokens", 100, 0.001);
    trackUsage(TEST_TENANT_ID, "compute_time", 500, 0.0001);

    const records = getUsage(TEST_TENANT_ID);
    expect(records.length).toBe(2);
    expect(records.every((r) => r.tenantId === TEST_TENANT_ID)).toBe(true);
  });

  it("getUsage with dateRange filters correctly", () => {
    // Insert a record with a known timestamp in the past
    const db = ensureAdminDb();
    db.run(
      `INSERT INTO usage_records (id, tenantId, resourceType, quantity, unitCost, metadata, timestamp)
       VALUES (?, ?, 'tokens', 100, 0.001, '{}', '2024-01-15T00:00:00.000Z')`,
      [crypto.randomUUID(), TEST_TENANT_ID]
    );
    // Insert a recent record
    trackUsage(TEST_TENANT_ID, "tokens", 200, 0.002);

    const filtered = getUsage(TEST_TENANT_ID, {
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-02-01T00:00:00.000Z",
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0].quantity).toBe(100);
  });

  it("getUsageSummary aggregates by resourceType", () => {
    trackUsage(TEST_TENANT_ID, "tokens", 100, 0.001);
    trackUsage(TEST_TENANT_ID, "tokens", 200, 0.002);
    trackUsage(TEST_TENANT_ID, "compute_time", 500, 0.0001);

    const summary = getUsageSummary(TEST_TENANT_ID);

    const tokenSummary = summary.find((s) => s.resourceType === "tokens");
    expect(tokenSummary).toBeDefined();
    expect(tokenSummary!.totalQuantity).toBe(300);
    expect(tokenSummary!.totalCost).toBeCloseTo(0.003);

    const computeSummary = summary.find(
      (s) => s.resourceType === "compute_time"
    );
    expect(computeSummary).toBeDefined();
    expect(computeSummary!.totalQuantity).toBe(500);
  });

  it("trackExecutionUsage creates both token and compute_time records", () => {
    const records = trackExecutionUsage(
      TEST_TENANT_ID,
      "exec-1",
      "dag-1",
      "gpt-4o",
      1000,
      500,
      3000
    );

    expect(records.length).toBe(2);

    const tokenRecord = records.find((r) => r.resourceType === "tokens");
    expect(tokenRecord).toBeDefined();
    expect(tokenRecord!.quantity).toBe(1500); // input + output

    const computeRecord = records.find(
      (r) => r.resourceType === "compute_time"
    );
    expect(computeRecord).toBeDefined();
    expect(computeRecord!.quantity).toBe(3000);
  });
});
