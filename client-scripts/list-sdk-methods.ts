#!/usr/bin/env bun
/**
 * list-sdk-methods.ts - List all services and methods in desiClient API SDK
 * Usage: bun run list-sdk-methods.ts
 * 
 * ALWAYS CHECK THE OUTPUT OF THIS SCRIPT BEFORE UPDATING THE API DOCUMENTATION
 * ALWAYS RUN THIS AFTER GENERATING THE SDK
 * 
 * 
 */

import { ApiClient } from '../desiClient';

const client = new ApiClient({
  baseUrl: 'http://localhost:3000',
  token: 'dummy',
});

const services = [
  'auth',
  'users',
  'agents',
  'dags',
  'executions',
  'tools',
  'costs',
  'billing',
  'admin',
] as const;

console.log('=== desiClient API SDK - Services and Methods ===\n');

// List root-level methods on ApiClient
const rootMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
  .filter((name) => name !== 'constructor' && typeof (client as any)[name] === 'function');

if (rootMethods.length > 0) {
  console.log('ApiClient (root methods):');
  rootMethods.forEach((method) => {
    console.log(`  - ${method}()`);
  });
  console.log();
}

// List methods for each service
for (const serviceName of services) {
  const service = (client as any)[serviceName];
  if (!service) continue;

  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service))
    .filter((name) => name !== 'constructor' && typeof service[name] === 'function');

  console.log(`${serviceName}:`);
  methods.forEach((method) => {
    console.log(`  - ${method}()`);
  });
  console.log();
}
