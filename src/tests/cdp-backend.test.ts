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
    assert.ok(fetchOptions.every((options) => options?.signal instanceof AbortSignal));
  } finally {
    global.fetch = originalFetch;
  }
});

test("CDP version responses are bounded during inspection and session creation", async () => {
  const originalFetch = global.fetch;
  let canceledBodies = 0;
  global.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(64 * 1024 + 1));
    },
    cancel() {
      canceledBodies += 1;
    }
  }), { status: 200 })) as typeof fetch;

  try {
    const status = await inspectCdpBackend();
    assert.equal(status.backend, "unavailable");
    assert.match(status.message, /CDP version response exceeded 65536 bytes/);
    await assert.rejects(createPageSession(), /CDP version response exceeded 65536 bytes/);
    assert.equal(canceledBodies, 3);
  } finally {
    global.fetch = originalFetch;
  }
});
