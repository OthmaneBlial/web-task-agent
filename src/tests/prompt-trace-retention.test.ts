import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { maintainPromptTraceRetention } from "../lib/prompt-trace";

test("prompt trace retention prunes old records without touching evidence files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-prompt-trace-retention-"));
  const tracePath = path.join(tempDir, "runtime", "llm-prompt-traces.json");

  try {
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.writeFileSync(
      tracePath,
      JSON.stringify(
        {
          version: 1,
          updatedAt: "2026-04-22T12:00:00.000Z",
          traces: [
            { traceId: "trace_a" },
            { traceId: "trace_b" },
            { traceId: "trace_c" }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const dryRun = maintainPromptTraceRetention({
      tracePath,
      maxTraces: 2,
      dryRun: true
    });
    assert.equal(dryRun.beforeCount, 3);
    assert.equal(dryRun.afterCount, 2);
    assert.equal(dryRun.removedCount, 1);

    const before = fs.readFileSync(tracePath, "utf8");
    const applied = maintainPromptTraceRetention({
      tracePath,
      maxTraces: 2
    });
    const after = fs.readFileSync(tracePath, "utf8");

    assert.equal(applied.beforeCount, 3);
    assert.equal(applied.afterCount, 2);
    assert.equal(applied.removedCount, 1);
    assert.notEqual(after, before);
    assert.deepEqual(
      JSON.parse(after).traces.map((trace: { traceId: string }) => trace.traceId),
      ["trace_b", "trace_c"]
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
