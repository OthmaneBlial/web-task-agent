import assert from "node:assert/strict";
import test from "node:test";

import { parseBingRssResults } from "../tasks/agent/search-adapters/bing-rss";
import { ResilientSearchAdapter } from "../tasks/agent/search-adapters/resilient-search";
import type { AgentSearchAdapter } from "../tasks/agent/search-adapter";

test("parseBingRssResults extracts result items from RSS xml", () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?>
    <rss version="2.0">
      <channel>
        <item>
          <title>PDF Editor for Android - Reddit</title>
          <link>https://www.reddit.com/r/androidapps/comments/example/pdf_editor/</link>
          <description><![CDATA[People discuss the best PDF editor apps on Android.]]></description>
        </item>
        <item>
          <title>PDF Editor App - Google Play</title>
          <link>https://play.google.com/store/apps/details?id=com.example.pdf</link>
          <description>Read reviews for a PDF editor app.</description>
        </item>
      </channel>
    </rss>`;

  const results = parseBingRssResults(xml, 10);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.title, "PDF Editor for Android - Reddit");
  assert.equal(results[0]?.site, "reddit.com");
  assert.match(results[0]?.snippet ?? "", /best PDF editor apps/i);
  assert.equal(results[1]?.site, "play.google.com");
});

test("ResilientSearchAdapter falls back when the primary provider fails", async () => {
  const events: string[] = [];
  const primary: AgentSearchAdapter = {
    id: "primary",
    label: "DuckDuckGo HTML",
    buildSearchUrl: (query) => `https://primary.example/search?q=${encodeURIComponent(query)}`,
    async search() {
      throw new Error("duckduckgo challenge page detected");
    }
  };
  const fallback: AgentSearchAdapter = {
    id: "fallback",
    label: "Bing RSS",
    buildSearchUrl: (query) => `https://fallback.example/search?q=${encodeURIComponent(query)}`,
    async search(query) {
      return {
        query,
        searchedAt: "2026-03-21T10:00:00.000Z",
        searchUrl: `https://fallback.example/search?q=${encodeURIComponent(query)}`,
        searchProvider: "fallback",
        pagesVisited: 1,
        exhausted: true,
        results: [
          {
            title: "Fallback result",
            url: "https://example.com/fallback",
            snippet: "Recovered via fallback.",
            site: "example.com"
          }
        ]
      };
    }
  };

  const adapter = new ResilientSearchAdapter((message) => events.push(message), [primary, fallback]);
  const result = await adapter.search("pdf editor", 5);

  assert.equal(result.searchProvider, "fallback");
  assert.equal(result.results.length, 1);
  assert.ok(events.some((message) => message.includes("DuckDuckGo HTML failed")));
  assert.ok(events.some((message) => message.includes("fallback provider Bing RSS succeeded")));
});

test("ResilientSearchAdapter prefers non-DuckDuckGo providers for structured queries", async () => {
  const calls: string[] = [];
  const primary: AgentSearchAdapter = {
    id: "duckduckgo_html",
    label: "DuckDuckGo HTML",
    buildSearchUrl: (query) => `https://primary.example/search?q=${encodeURIComponent(query)}`,
    async search() {
      calls.push("primary");
      return {
        query: "ignored",
        searchedAt: "2026-03-21T10:00:00.000Z",
        searchUrl: "https://primary.example",
        searchProvider: "primary",
        pagesVisited: 1,
        exhausted: true,
        results: []
      };
    }
  };
  const fallback: AgentSearchAdapter = {
    id: "bing_rss",
    label: "Bing RSS",
    buildSearchUrl: (query) => `https://fallback.example/search?q=${encodeURIComponent(query)}`,
    async search(query) {
      calls.push("fallback");
      return {
        query,
        searchedAt: "2026-03-21T10:00:00.000Z",
        searchUrl: `https://fallback.example/search?q=${encodeURIComponent(query)}`,
        searchProvider: "fallback",
        pagesVisited: 1,
        exhausted: true,
        results: []
      };
    }
  };

  const adapter = new ResilientSearchAdapter(() => undefined, [primary, fallback]);
  const result = await adapter.search('site:play.google.com "resume builder" app reviews complaints', 5);

  assert.equal(result.searchProvider, "fallback");
  assert.deepEqual(calls, ["fallback"]);
});

test("ResilientSearchAdapter demotes DuckDuckGo after a challenge is detected", async () => {
  const events: string[] = [];
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const primary: AgentSearchAdapter = {
    id: "duckduckgo_html",
    label: "DuckDuckGo HTML",
    buildSearchUrl: (query) => `https://primary.example/search?q=${encodeURIComponent(query)}`,
    async search() {
      primaryCalls += 1;
      throw new Error("duckduckgo challenge page detected");
    }
  };
  const fallback: AgentSearchAdapter = {
    id: "bing_rss",
    label: "Bing RSS",
    buildSearchUrl: (query) => `https://fallback.example/search?q=${encodeURIComponent(query)}`,
    async search(query) {
      fallbackCalls += 1;
      return {
        query,
        searchedAt: "2026-03-21T10:00:00.000Z",
        searchUrl: `https://fallback.example/search?q=${encodeURIComponent(query)}`,
        searchProvider: "fallback",
        pagesVisited: 1,
        exhausted: true,
        results: []
      };
    }
  };

  const adapter = new ResilientSearchAdapter((message) => events.push(message), [primary, fallback]);
  await adapter.search("pdf editor", 5);
  await adapter.search('"resume builder" app feature requests', 5);

  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 2);
  assert.ok(events.some((message) => /preferring non-DuckDuckGo/i.test(message)));
});
