import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDuckDuckGoSearchUrl } from "../tasks/agent/search-adapters/duckduckgo-html";

test("DuckDuckGo pagination stays on its HTTPS HTML search endpoint", () => {
  const initial = "https://html.duckduckgo.com/html/?q=local+research";

  assert.equal(normalizeDuckDuckGoSearchUrl(initial), initial);
  assert.equal(
    normalizeDuckDuckGoSearchUrl("/html/?q=local+research&s=30", initial),
    "https://html.duckduckgo.com/html/?q=local+research&s=30"
  );

  for (const url of [
    "http://html.duckduckgo.com/html/?q=research",
    "https://duckduckgo.com/html/?q=research",
    "https://html.duckduckgo.com.evil.example/html/?q=research",
    "https://html.duckduckgo.com/settings",
    "https://user@html.duckduckgo.com/html/?q=research",
    "https://html.duckduckgo.com:8443/html/?q=research",
    "http://127.0.0.1/html/?q=research"
  ]) {
    assert.equal(normalizeDuckDuckGoSearchUrl(url), null, url);
  }
});
