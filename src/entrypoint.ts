#!/usr/bin/env node

import { redactSensitiveText } from "./lib/redaction";

async function boot(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "mcp" && args[1] === "serve") {
    await import("./mcp/server.js");
    return;
  }
  await import("./cli.js");
}

void boot().catch((error: unknown) => {
  console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
