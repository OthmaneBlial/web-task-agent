import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("published CLI entrypoint and required modules are present in the npm tarball", () => {
  const cliPath = path.resolve("dist/cli.js");
  const contents = fs.readFileSync(cliPath, "utf8");

  assert.ok(contents.startsWith("#!/usr/bin/env node\n"));

  const packJson = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" })) as Array<{
    files: Array<{ path: string }>;
  }> | Record<string, { files: Array<{ path: string }> }>;
  const packed = Array.isArray(packJson) ? packJson[0] : Object.values(packJson)[0];
  assert.ok(packed, "npm pack must describe the generated tarball");
  const publishedFiles = new Set(packed.files.map((file) => file.path));

  for (const requiredPath of [
    "dist/cli.js",
    "dist/mcp/server.js",
    "dist/demos/index.js",
    "dist/packs/index.js",
    "dist/server/management-server.js",
    "dist/tasks/agent-runner.js",
    "dist/workflows/index.js",
    "packages/decision-receipt/dist/index.js",
    "packages/decision-receipt/dist/index.d.ts",
    "packages/decision-receipt/dist/cli.js",
    "schema/decision-receipt.v1.schema.json",
    "schema/decision-receipt-adapter.v1.schema.json",
    "conformance/cases.json",
    ".env.example"
  ]) {
    assert.ok(publishedFiles.has(requiredPath), `${requiredPath} must be included in the npm tarball`);
  }
});
