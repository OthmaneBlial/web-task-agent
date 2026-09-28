import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";

import { SourceAcquisitionPolicy } from "../lib/source-acquisition-policy";
import { BrowserPageFetcher } from "../tasks/agent/fetchers/browser-fetcher";

const cdpModule = require("../lib/cdp") as typeof import("../lib/cdp");

test("browser page digest bounds remote text and stops scanning after its limits", async () => {
  const headingsRead = { count: 0 };
  const paragraphsRead = { count: 0 };
  const oversizedText = "Useful article evidence. ".repeat(10_000);
  const textNodeReads = { count: 0 };
  const elementWithText = (counter?: { count: number }) => {
    const textNode = {
      get nodeValue() {
        textNodeReads.count += 1;
        return oversizedText;
      }
    };
    return {
      get textContent() {
        if (counter) counter.count += 1;
        return oversizedText;
      },
      get textNode() {
        if (counter) counter.count += 1;
        return textNode;
      }
    };
  };
  const document = {
    title: oversizedText,
    querySelector(selector: string) {
      if (selector.startsWith("meta[")) {
        return { getAttribute: () => oversizedText };
      }
      return elementWithText();
    },
    querySelectorAll(selector: string) {
      const size = 1_000;
      if (selector === "h2, h3") {
        return Array.from({ length: size }, () => elementWithText(headingsRead));
      }
      return Array.from({ length: size }, () => elementWithText(paragraphsRead));
    },
    createTreeWalker(element: { textNode: unknown }) {
      let read = false;
      return {
        nextNode() {
          if (read) return null;
          read = true;
          return element.textNode;
        }
      };
    }
  };
  const client = {
    Runtime: {
      enable: async () => undefined,
      evaluate: async ({ expression }: { expression: string }) => ({
        result: {
          value: await vm.runInNewContext(expression, {
            document,
            NodeFilter: { SHOW_TEXT: 4 },
            window: { location: { href: "https://docs.example.com/article", hostname: "docs.example.com" } }
          })
        }
      })
    }
  };
  const fetcher = new BrowserPageFetcher(() => undefined);
  const scrape = (fetcher as unknown as {
    scrapePageDigest(value: unknown): Promise<{
      title: string;
      description: string;
      h1: string | null;
      headings: string[];
      paragraphs: string[];
    }>;
  }).scrapePageDigest.bind(fetcher);

  const page = await scrape(client);

  assert.ok(page.title.length <= 500);
  assert.ok(page.description.length <= 1000);
  assert.ok((page.h1?.length ?? 0) <= 500);
  assert.equal(page.headings.length, 6);
  assert.ok(page.headings.every((heading) => heading.length <= 500));
  assert.equal(headingsRead.count, 6);
  assert.equal(page.paragraphs.length, 4);
  assert.ok(page.paragraphs.every((paragraph) => paragraph.length <= 8000));
  assert.equal(paragraphsRead.count, 4);
  assert.equal(textNodeReads.count, 11);
});

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
        assert.deepEqual(patterns.map(({ urlPattern }) => urlPattern), ["*"]);
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

  cdpModule.createPageSession = async (_url, options) => {
    await cdpModule.installRequestPolicy(
      client,
      options!.requestTargetPolicy!,
      options!.onMainFrameBlocked
    );
    return client as never;
  };

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
