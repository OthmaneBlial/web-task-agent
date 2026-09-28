import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";

import {
  closePageSessionResources,
  locateElement,
  trackNetworkActivity,
  waitForNetworkIdle
} from "../lib/cdp";
import { humanClick } from "../lib/humanizer";
import type { CDPClient } from "../types";

function createOversizedDomClient() {
  const matches = {
    length: 5_001,
    [Symbol.iterator]() {
      throw new Error("oversized DOM matches should not be iterated");
    }
  };
  let evaluations = 0;
  const client = {
    Runtime: {
      enable: async () => undefined,
      evaluate: async ({ expression }: { expression: string }) => {
        evaluations += 1;
        return {
          result: {
            value: await vm.runInNewContext(expression, {
              document: { querySelectorAll: () => matches }
            })
          }
        };
      }
    }
  };
  return { client: client as unknown as CDPClient, evaluationCount: () => evaluations };
}

function createNetworkEventClient(
  enable: () => Promise<void> = async () => undefined,
  listeners = new Map<string, (...args: unknown[]) => void>()
) {
  const client = {
    Network: { enable },
    on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
    off: (event: string, listener: (...args: unknown[]) => void) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }
  } as unknown as CDPClient;
  return { client, listeners };
}

test("element lookup refuses oversized DOM scans before iterating matches", async () => {
  const { client } = createOversizedDomClient();

  for (const query of ["css=.target", "Install"]) {
    const result = await locateElement(client, query);
    assert.equal(result.status, "ambiguous");
    assert.equal(result.query, query);
    assert.equal(result.count, 5_001);
    assert.equal(result.matches?.length, 0);
  }
});

test("click reports ambiguous matches without scrolling the page", async () => {
  const { client, evaluationCount } = createOversizedDomClient();

  await assert.rejects(humanClick(client, "css=.target"), /matched 5001 elements/);
  assert.equal(evaluationCount(), 1);
});

test("page session cleanup disposes its context even if target close fails", async () => {
  const calls: string[] = [];
  const client = {
    Target: {
      closeTarget: async ({ targetId }: { targetId: string }) => {
        calls.push(`target:${targetId}`);
        throw new Error("target already closed");
      },
      disposeBrowserContext: async ({ browserContextId }: { browserContextId: string }) => {
        calls.push(`context:${browserContextId}`);
      }
    },
    close: async () => calls.push("connection")
  } as unknown as CDPClient;

  await closePageSessionResources(client, "target-1", "context-1", () => calls.push("listeners"));

  assert.deepEqual(calls, [
    "listeners",
    "target:target-1",
    "context:context-1",
    "connection"
  ]);
});

test("page session cleanup disposes a partially-created context and closes the connection", async () => {
  const calls: string[] = [];
  const client = {
    Target: {
      closeTarget: async () => calls.push("unexpected target close"),
      disposeBrowserContext: async ({ browserContextId }: { browserContextId: string }) => {
        calls.push(`context:${browserContextId}`);
        throw new Error("context already disposed");
      }
    },
    close: async () => calls.push("connection")
  } as unknown as CDPClient;

  await closePageSessionResources(client, undefined, "context-2", () => calls.push("listeners"));

  assert.deepEqual(calls, ["listeners", "context:context-2", "connection"]);
});

test("network idle ignores malformed request IDs and removes its listeners", async () => {
  const { client, listeners } = createNetworkEventClient();

  const idle = waitForNetworkIdle(client, { idleTimeMs: 5, timeoutMs: 500 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const requestStarted = listeners.get("Network.requestWillBeSent");
  const requestFinished = listeners.get("Network.loadingFinished");
  assert.ok(requestStarted);
  assert.ok(requestFinished);
  requestStarted({ requestId: 42 });
  requestFinished({ requestId: "42" });

  await idle;
  assert.equal(listeners.size, 0);
});

test("network idle waits for requests started before the wait", async () => {
  const { client, listeners } = createNetworkEventClient();
  await client.Network.enable();
  const stopTracking = trackNetworkActivity(client);
  let resolved = false;

  try {
    listeners.get("Network.requestWillBeSent")?.({ requestId: "page-load" });
    const idle = waitForNetworkIdle(client, { idleTimeMs: 0, timeoutMs: 500 }).then(() => {
      resolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(resolved, false);
    listeners.get("Network.loadingFinished")?.({ requestId: "page-load" });
    await idle;
    assert.equal(resolved, true);
  } finally {
    stopTracking();
  }

  assert.equal(listeners.size, 0);
});

test("network idle tracks requests emitted while enabling the network domain", async () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  let resolveEnable!: () => void;
  const { client } = createNetworkEventClient(
    () => {
      listeners.get("Network.requestWillBeSent")?.({ requestId: "enable-race" });
      return new Promise<void>((resolve) => {
        resolveEnable = resolve;
      });
    },
    listeners
  );

  let resolved = false;
  const idle = waitForNetworkIdle(client, { idleTimeMs: 0, timeoutMs: 500 }).then(() => {
    resolved = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(listeners.has("Network.requestWillBeSent"), true);
  resolveEnable();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(resolved, false);
  listeners.get("Network.loadingFinished")?.({ requestId: "enable-race" });
  await idle;
  assert.equal(resolved, true);
  assert.equal(listeners.size, 0);
});
