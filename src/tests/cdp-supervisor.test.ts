import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
    new Response(JSON.stringify({
      Browser: "Lightpanda/1.0"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

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

test("withLightpandaRecovery preserves a reachable Chrome CDP server", async () => {
  const originalFetch = global.fetch;
  let restartCalls = 0;
  let operationAttempts = 0;

  configureLightpandaCommandRunnerForTests(async () => {
    restartCalls += 1;
  });

  global.fetch = (async () =>
    new Response(JSON.stringify({
      Browser: "Chrome/140.0.0.0"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

  try {
    const result = await withLightpandaRecovery({
      label: "test Chrome recovery",
      task: async () => {
        operationAttempts += 1;
        if (operationAttempts === 1) throw new Error("WebSocket connection closed");
        return "ok";
      }
    });

    assert.equal(result, "ok");
    assert.equal(operationAttempts, 2);
    assert.equal(restartCalls, 0);
  } finally {
    global.fetch = originalFetch;
    configureLightpandaCommandRunnerForTests(null);
  }
});

test("Lightpanda start refuses to terminate another browser on the CDP port", (context) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-lightpanda-port-"));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(binDir, "curl"), "#!/bin/sh\nprintf '{\"Browser\":\"Chrome/140.0.0.0\"}\\n'\n", { mode: 0o700 });

  const result = spawnSync("/bin/bash", [path.join(process.cwd(), "scripts", "start-lightpanda.sh"), "start"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: [binDir, process.env.PATH ?? ""].join(path.delimiter),
      CDP_PORT: "19222",
      LIGHTPANDA_DIR: path.join(tempDir, "lightpanda")
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /port 19222 is occupied by chrome/i);
  assert.equal(fs.existsSync(path.join(tempDir, "lightpanda")), false);
});
