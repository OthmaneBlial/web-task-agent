import assert from "node:assert/strict";
import test from "node:test";

import { SourceAcquisitionPolicy } from "../lib/source-acquisition-policy";
import { BrowserPageFetcher } from "../tasks/agent/fetchers/browser-fetcher";

const cdpModule = require("../lib/cdp") as typeof import("../lib/cdp");

test("browser fetcher records browser-session failures as error results", async () => {
  const events: string[] = [];
  const originalCreatePageSession = cdpModule.createPageSession;

  cdpModule.createPageSession = async () => {
    throw new Error("lightpanda unavailable");
  };

  try {
    const fetcher = new BrowserPageFetcher((message) => events.push(message), {
      userAgent: "web-task-agent-test",
      checkNetworkTarget: async () => ({
        action: "allow",
        reason: "fixture source allowed",
        signals: ["fixture"],
        waitedMs: 0
      }),
      prepare: async () => ({
        action: "allow",
        reason: "fixture source allowed",
        signals: ["fixture"],
        waitedMs: 0
      })
    });
    const results = await fetcher.fetchResults([
      {
        title: "Docs article",
        url: "https://docs.example.com/article",
        snippet: "A documentation page that should reach the browser fetcher.",
        site: "docs.example.com",
        reviewStatus: "read"
      }
    ]);

    assert.equal(results.length, 1);
    assert.equal(results[0]?.reviewStatus, "error");
    assert.match(results[0]?.skipReason ?? "", /lightpanda unavailable/i);
    assert.ok(events.some((message) => message.includes("failed article: Docs article")));
  } finally {
    cdpModule.createPageSession = originalCreatePageSession;
  }
});

test("browser fetcher blocks a redirect to a private address before connecting", async () => {
  const originalCreatePageSession = cdpModule.createPageSession;
  let requestPaused: ((event: {
    requestId: string;
    request: { url: string };
    frameId: string;
    resourceType: string;
  }) => Promise<void>) | undefined;
  const continued: string[] = [];
  const blocked: string[] = [];
  const client = {
    on: (event: string, handler: typeof requestPaused) => {
      assert.equal(event, "Fetch.requestPaused");
      requestPaused = handler;
    },
    Fetch: {
      enable: async ({ patterns }: { patterns: Array<{ urlPattern: string; requestStage: string }> }) => {
        assert.deepEqual(patterns.map(({ urlPattern }) => urlPattern), ["http://*/*", "https://*/*"]);
      },
      continueRequest: async ({ requestId }: { requestId: string }) => { continued.push(requestId); },
      failRequest: async ({ requestId, errorReason }: { requestId: string; errorReason: string }) => {
        assert.equal(errorReason, "BlockedByClient");
        blocked.push(requestId);
      }
    },
    Page: {
      navigate: async ({ url }: { url: string }) => {
        assert.equal(url, "https://docs.example.com/article");
        assert.ok(requestPaused);
        await requestPaused({
          requestId: "source-request",
          request: { url },
          frameId: "main-frame",
          resourceType: "Document"
        });
        await requestPaused({
          requestId: "redirect-request",
          request: { url: "http://127.0.0.1:9222/internal" },
          frameId: "main-frame",
          resourceType: "Document"
        });
      }
    },
    Runtime: {
      enable: async () => undefined,
      evaluate: async () => ({ result: { value: { ok: true, value: "complete" } } })
    }
  };

  cdpModule.createPageSession = async () => client as never;

  try {
    const policy = new SourceAcquisitionPolicy({
      minDomainDelayMs: 0,
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchRobots: async () => ({ ok: true, status: 200, text: async () => "User-agent: *\nAllow: /\n" })
    });
    const fetcher = new BrowserPageFetcher(() => undefined, policy);
    const [result] = await fetcher.fetchResults([{
      title: "Docs article",
      url: "https://docs.example.com/article",
      snippet: "A documentation page that should not reach a private redirect target.",
      site: "docs.example.com",
      reviewStatus: "read"
    }]);

    assert.equal(result?.reviewStatus, "skipped");
    assert.match(result?.skipReason ?? "", /private or reserved network address/i);
    assert.deepEqual(continued, ["source-request"]);
    assert.deepEqual(blocked, ["redirect-request"]);
  } finally {
    cdpModule.createPageSession = originalCreatePageSession;
  }
});
