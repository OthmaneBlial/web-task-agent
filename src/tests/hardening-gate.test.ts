import assert from "node:assert/strict";
import test from "node:test";

import { evaluateProductionHardeningGate, formatProductionHardeningGateLines } from "../lib/hardening-gate";

test("production hardening gate passes when storage and queue look healthy", () => {
  const gate = evaluateProductionHardeningGate({
    storage: {
      healthy: true,
      warnings: []
    },
    queue: {
      queued: 0,
      running: 0,
      paused: 0,
      completed: 2,
      failed: 0,
      cancelled: 0
    },
    recoverableJobs: 0
  });

  assert.equal(gate.passed, true);
  assert.ok(gate.checks.every((check) => check.passed));
  assert.ok(formatProductionHardeningGateLines(gate).some((line) => line.includes("PASS")));
});

test("production hardening gate fails when storage or recovery needs attention", () => {
  const gate = evaluateProductionHardeningGate({
    storage: {
      healthy: false,
      warnings: ["Unexpected schema version 3"]
    },
    queue: {
      queued: 1,
      running: 0,
      paused: 1,
      completed: 0,
      failed: 1,
      cancelled: 0
    },
    recoverableJobs: 2
  });

  assert.equal(gate.passed, false);
  assert.ok(gate.checks.some((check) => !check.passed));
  assert.ok(
    formatProductionHardeningGateLines(gate).some((line) =>
      line.includes("needs attention")
    )
  );
});
