import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCliArgv } from "../lib/cli-argv";

test("new job and storage commands stay unchanged by argv normalization", () => {
  const argv = ["node", "dist/cli.js", "job", "report", "job_1", "--limit", "5"];
  assert.deepEqual(normalizeCliArgv(argv), argv);
});

test("storage cleanup commands stay unchanged by argv normalization", () => {
  const argv = [
    "node",
    "dist/cli.js",
    "storage",
    "cleanup",
    "--prompt-traces",
    ".cache/runtime/llm-prompt-traces.json",
    "--max-traces",
    "100"
  ];
  assert.deepEqual(normalizeCliArgv(argv), argv);
});

test("storage gate commands stay unchanged by argv normalization", () => {
  const argv = ["node", "dist/cli.js", "storage", "gate"];
  assert.deepEqual(normalizeCliArgv(argv), argv);
});

test("workflow preview commands stay unchanged by legacy workflow argv normalization", () => {
  const argv = ["node", "dist/cli.js", "workflow", "preview", "market-opportunity", "--topic", "local research"];
  assert.deepEqual(normalizeCliArgv(argv), argv);
});

test("job budget commands stay unchanged by argv normalization", () => {
  const argv = ["node", "dist/cli.js", "job", "budget", "job_1"];
  assert.deepEqual(normalizeCliArgv(argv), argv);
});
