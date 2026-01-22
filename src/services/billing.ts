import { getAdminDatabase } from "../db/admin-schema";
import type { UsageRecord, UsageMetadata } from "../db/billing-schema";
import { initializeBillingSchema } from "../db/billing-schema";

export interface DateRange {
  start: string;
  end: string;
}

export interface TrackUsageOptions {
  executionId?: string;
  dagId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  computeTimeMs?: number;
}

export function trackUsage(
  tenantId: string,
  resourceType: string,
  quantity: number,
  unitCost: number,
  metadata: TrackUsageOptions = {}
): UsageRecord {
  const db = getAdminDatabase();
  initializeBillingSchema(db);

  const id = crypto.randomUUID();
  const metadataJson = JSON.stringify(metadata);
  const timestamp = new Date().toISOString();

  db.run(
    `INSERT INTO usage_records (id, tenantId, resourceType, quantity, unitCost, metadata, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, resourceType, quantity, unitCost, metadataJson, timestamp]
  );

  return {
    id,
    tenantId,
    resourceType,
    quantity,
    unitCost,
    metadata: metadataJson,
    timestamp,
  };
}

export function getUsage(
  tenantId: string,
  dateRange?: DateRange
): UsageRecord[] {
  const db = getAdminDatabase();
  initializeBillingSchema(db);

  if (dateRange) {
    return db
      .query<UsageRecord, [string, string, string]>(
        `SELECT id, tenantId, resourceType, quantity, unitCost, metadata, timestamp
         FROM usage_records
         WHERE tenantId = ? AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp DESC`
      )
      .all(tenantId, dateRange.start, dateRange.end);
  }

  return db
    .query<UsageRecord, [string]>(
      `SELECT id, tenantId, resourceType, quantity, unitCost, metadata, timestamp
       FROM usage_records
       WHERE tenantId = ?
       ORDER BY timestamp DESC`
    )
    .all(tenantId);
}

export function trackExecutionUsage(
  tenantId: string,
  executionId: string,
  dagId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  computeTimeMs: number
): UsageRecord[] {
  const records: UsageRecord[] = [];

  const tokenCostPerMillion = 0.002;
  const totalTokens = inputTokens + outputTokens;
  const tokenCost = (totalTokens / 1_000_000) * tokenCostPerMillion;

  records.push(
    trackUsage(tenantId, "tokens", totalTokens, tokenCost, {
      executionId,
      dagId,
      model,
      inputTokens,
      outputTokens,
    })
  );

  const computeCostPerHour = 0.01;
  const computeCost = (computeTimeMs / 3_600_000) * computeCostPerHour;

  records.push(
    trackUsage(tenantId, "compute_time", computeTimeMs, computeCost, {
      executionId,
      dagId,
      computeTimeMs,
    })
  );

  return records;
}

export function getUsageSummary(
  tenantId: string,
  dateRange?: DateRange
): { resourceType: string; totalQuantity: number; totalCost: number }[] {
  const db = getAdminDatabase();
  initializeBillingSchema(db);

  const baseQuery = `
    SELECT 
      resourceType,
      SUM(quantity) as totalQuantity,
      SUM(unitCost) as totalCost
    FROM usage_records
    WHERE tenantId = ?`;

  if (dateRange) {
    return db
      .query<
        { resourceType: string; totalQuantity: number; totalCost: number },
        [string, string, string]
      >(
        `${baseQuery} AND timestamp >= ? AND timestamp <= ?
         GROUP BY resourceType`
      )
      .all(tenantId, dateRange.start, dateRange.end);
  }

  return db
    .query<
      { resourceType: string; totalQuantity: number; totalCost: number },
      [string]
    >(`${baseQuery} GROUP BY resourceType`)
    .all(tenantId);
}
