import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("published CLI entrypoint starts with a Node shebang", () => {
  const cliPath = path.resolve("dist/cli.js");
  const contents = fs.readFileSync(cliPath, "utf8");

  assert.ok(contents.startsWith("#!/usr/bin/env node\n"));
});
