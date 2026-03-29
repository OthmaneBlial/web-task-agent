import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCliArgv } from "../lib/cli-argv";

test("workflow template shorthand inserts the run subcommand", () => {
  const argv = [
    "node",
    "dist/cli.js",
    "workflow",
    "android-opportunity",
    "--topic",
    "Offline Resume Builder",
    "--research-duration",
    "2h"
  ];

  assert.deepEqual(normalizeCliArgv(argv), [
    "node",
    "dist/cli.js",
    "workflow",
    "run",
    "android-opportunity",
    "--topic",
    "Offline Resume Builder",
    "--research-duration",
    "2h"
  ]);
});

test("workflow subcommands stay unchanged", () => {
  const argv = ["node", "dist/cli.js", "workflow", "enqueue", "android-opportunity"];
  assert.deepEqual(normalizeCliArgv(argv), argv);
});

test("non-workflow commands stay unchanged", () => {
  const argv = ["node", "dist/cli.js", "agent", "run", "Offline PDF Editor Android apps"];
  assert.deepEqual(normalizeCliArgv(argv), argv);
});
