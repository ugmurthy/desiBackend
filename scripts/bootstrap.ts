#!/usr/bin/env bun
/**
 * Bootstrap CLI command for initializing the desiAgent admin system.
 * Usage: bun run bootstrap-admin [--force]
 */

import { runBootstrap } from "../src/services/bootstrap";

const args = process.argv.slice(2);
const force = args.includes("--force");

async function main(): Promise<void> {
  console.log("🚀 desiAgent Bootstrap");
  console.log(`   Force mode: ${force ? "enabled" : "disabled"}`);
  console.log("");

  await runBootstrap({ force });

  console.log("\n✅ Bootstrap completed successfully!");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("❌ Bootstrap failed:", error);
    process.exit(1);
  });
