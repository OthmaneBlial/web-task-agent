import assert from "node:assert/strict";
import test from "node:test";

import {
  configureLightpandaCommandRunnerForTests,
  ensureDebuggerReady,
  withLightpandaRecovery
} from "../lib/cdp";

test("ensureDebuggerReady auto-starts Lightpanda when the CDP endpoint is down", async () => {
  const originalFetch = global.fetch;
  let startCalls = 0;
  let reachable = false;

  configureLightpandaCommandRunnerForTests(async (action) => {
    assert.equal(action, "start");
    startCalls += 1;
    reachable = true;
  });

  global.fetch = (async () => {
    if (!reachable) {
      throw new Error("connect ECONNREFUSED 127.0.0.1:9222");
    }
    return {
      ok: true
    } as Response;
  }) as typeof fetch;

  try {
    await ensureDebuggerReady();
    assert.equal(startCalls, 1);
  } finally {
    global.fetch = originalFetch;
    configureLightpandaCommandRunnerForTests(null);
  }
});

test("withLightpandaRecovery restarts Lightpanda and retries once on recoverable CDP failure", async () => {
  const originalFetch = global.fetch;
  let restartCalls = 0;
  let operationAttempts = 0;

  configureLightpandaCommandRunnerForTests(async (action) => {
    assert.equal(action, "restart");
    restartCalls += 1;
  });

  global.fetch = (async () =>
    ({
      ok: true
    }) as Response) as typeof fetch;

  try {
    const result = await withLightpandaRecovery({
      label: "test recovery",
      task: async () => {
        operationAttempts += 1;
        if (operationAttempts === 1) {
          throw new Error("WebSocket connection closed");
        }
        return "ok";
      }
    });

    assert.equal(result, "ok");
    assert.equal(operationAttempts, 2);
    assert.equal(restartCalls, 1);
  } finally {
    global.fetch = originalFetch;
    configureLightpandaCommandRunnerForTests(null);
  }
});
