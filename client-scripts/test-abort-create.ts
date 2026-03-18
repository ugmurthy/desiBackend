#!/usr/bin/env bun
/**
 * test-abort-create.ts - Test aborting an inflight dags.create (createFromGoal) API call
 * Usage: bun run client-scripts/test-abort-create.ts
 *
 * Initiates a dag.create call and aborts it after a configurable delay
 * to verify that inflight API requests can be cancelled via AbortController.
 */

import { ApiClient } from '../desiClient';

const API_BASE_URL = process.env.DESI_BACKEND_URL || 'http://localhost:3000';
const API_TOKEN = process.env.DESI_API_TOKEN || '';
const ABORT_DELAY_MS = parseInt(process.env.ABORT_DELAY_MS || '2000', 10);

if (!API_TOKEN) {
  console.error('Error: DESI_API_TOKEN environment variable is not set');
  console.error('Please set it using: export DESI_API_TOKEN=<your-api-token>');
  process.exit(1);
}

const client = new ApiClient({
  baseUrl: API_BASE_URL,
  token: API_TOKEN,
  timeout: 120000, // long timeout so the abort kicks in first
});

const controller = new AbortController();

console.log(`[${new Date().toISOString()}] Starting dags.create request...`);
console.log(`[${new Date().toISOString()}] Will abort after ${ABORT_DELAY_MS}ms`);
console.log('');

// Schedule the abort
const abortTimer = setTimeout(() => {
  console.log(`[${new Date().toISOString()}] ⚡ Aborting request now!`);
  controller.abort();
}, ABORT_DELAY_MS);

const startTime = Date.now();

try {
  const result = await client.dags.create({
    body: {
      goalText:
        'Research the top 5 cloud providers and compare their pricing for compute, storage, and networking. Write a detailed report to cloud-comparison.md',
      agentName: 'DecomposerV8',
      temperature: 0.7,
    },
    signal: controller.signal,
  });

  // If we get here, the request completed before the abort
  clearTimeout(abortTimer);
  const elapsed = Date.now() - startTime;
  console.log(`[${new Date().toISOString()}] ✅ Request completed before abort (${elapsed}ms)`);
  console.log('Response:', JSON.stringify(result, null, 2));
} catch (error: unknown) {
  clearTimeout(abortTimer);
  const elapsed = Date.now() - startTime;

  if (error instanceof DOMException && error.name === 'AbortError') {
    console.log(`[${new Date().toISOString()}] ✅ Request was successfully aborted after ${elapsed}ms`);
    console.log('AbortError caught as expected.');
  } else if (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'ERR_CANCELED'
  ) {
    // Axios wraps abort as CanceledError with code ERR_CANCELED
    console.log(`[${new Date().toISOString()}] ✅ Request was successfully aborted after ${elapsed}ms`);
    console.log('Axios CanceledError caught as expected.');
    console.log('Error code:', (error as { code?: string }).code);
  } else {
    console.error(`[${new Date().toISOString()}] ❌ Unexpected error after ${elapsed}ms`);
    console.error('Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && 'response' in error) {
      const axiosErr = error as { response?: { status?: number; data?: unknown } };
      console.error('Status:', axiosErr.response?.status);
      console.error('Data:', JSON.stringify(axiosErr.response?.data, null, 2));
    }
    process.exit(1);
  }
}

console.log('');
console.log('Done!');
