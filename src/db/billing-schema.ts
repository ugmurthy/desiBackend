import type { Database } from "bun:sqlite";
import { getAdminDatabase } from "./admin-schema";

export interface UsageRecord {
  id: string;
  tenantId: string;
  resourceType: string;
  quantity: number;
  unitCost: number;
  metadata: string; // JSON string
  timestamp: string;
}

export interface UsageMetadata {
  executionId?: string;
  dagId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  computeTimeMs?: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  lineItems: string; // JSON string
  subtotal: number;
  total: number;
  status: "draft" | "pending" | "paid" | "overdue" | "cancelled";
  createdAt: string;
}

export interface InvoiceLineItem {
  description: string;
  resourceType: string;
  quantity: number;
  unitCost: number;
  amount: number;
}

export function initializeBillingSchema(db?: Database): Database {
  const adminDb = db ?? getAdminDatabase();

  adminDb.exec(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitCost REAL NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_usage_records_tenantId ON usage_records(tenantId);
    CREATE INDEX IF NOT EXISTS idx_usage_records_timestamp ON usage_records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_records_resourceType ON usage_records(resourceType);
    CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_timestamp ON usage_records(tenantId, timestamp);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      periodStart TEXT NOT NULL,
      periodEnd TEXT NOT NULL,
      lineItems TEXT NOT NULL DEFAULT '[]',
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_tenantId ON invoices(tenantId);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_periodStart ON invoices(periodStart);
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant_period ON invoices(tenantId, periodStart);
  `);

  return adminDb;
}
