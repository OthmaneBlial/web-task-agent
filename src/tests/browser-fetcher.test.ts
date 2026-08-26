import assert from "node:assert/strict";
import test from "node:test";

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
