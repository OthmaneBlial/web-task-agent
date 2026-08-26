import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("published CLI entrypoint and required modules are present in the npm tarball", () => {
  const cliPath = path.resolve("dist/cli.js");
  const contents = fs.readFileSync(cliPath, "utf8");

  assert.ok(contents.startsWith("#!/usr/bin/env node\n"));

  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" })) as Array<{
    files: Array<{ path: string }>;
  }>;
  const publishedFiles = new Set(packed[0].files.map((file) => file.path));

  for (const requiredPath of [
    "dist/cli.js",
    "dist/demos/index.js",
    "dist/packs/index.js",
    "dist/server/management-server.js",
    "dist/tasks/agent-runner.js",
    "dist/workflows/index.js"
  ]) {
    assert.ok(publishedFiles.has(requiredPath), `${requiredPath} must be included in the npm tarball`);
  }
});
