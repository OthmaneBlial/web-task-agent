import assert from "node:assert/strict";
import test from "node:test";

import { classifyCdpBackend, createPageSession, inspectCdpBackend } from "../lib/cdp";

test("CDP backend classification makes the local browser choice explicit", () => {
  assert.equal(classifyCdpBackend("Lightpanda/0.1"), "lightpanda");
  assert.equal(classifyCdpBackend("Chrome/140.0.0.0"), "chrome");
  assert.equal(classifyCdpBackend("Chromium/140.0.0.0"), "chrome");
  assert.equal(classifyCdpBackend("Custom CDP Browser"), "unknown");
  assert.equal(classifyCdpBackend(null), "unavailable");
});

test("CDP discovery rejects redirects and non-local WebSocket targets", async () => {
  const originalFetch = global.fetch;
  const fetchOptions: Array<RequestInit | undefined> = [];
  global.fetch = (async (_input, init) => {
    fetchOptions.push(init);
    return new Response(JSON.stringify({
      Browser: "Lightpanda/0.1",
      "Protocol-Version": "1.3",
      webSocketDebuggerUrl: "ws://example.com:9222/devtools/browser/id"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    assert.equal((await inspectCdpBackend()).backend, "lightpanda");
    await assert.rejects(createPageSession(), /refusing non-local CDP WebSocket URL/);
    assert.equal(fetchOptions.length, 3);
    assert.ok(fetchOptions.every((options) => options?.redirect === "error"));
  } finally {
    global.fetch = originalFetch;
  }
});
