#!/usr/bin/env node

async function boot(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "mcp" && args[1] === "serve") {
    await import("./mcp/server");
    return;
  }
  await import("./cli");
}

void boot().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
