import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGitHubSearchUrl } from "../tasks/github-scanner";

test("GitHub scanner accepts only HTTPS GitHub search URLs and same-search pagination", () => {
  const initial = "https://github.com/search?q=local+research&type=repositories";

  assert.equal(normalizeGitHubSearchUrl(initial), initial);
  assert.equal(
    normalizeGitHubSearchUrl("?q=local+research&type=repositories&page=2", initial),
    "https://github.com/search?q=local+research&type=repositories&page=2"
  );

  for (const url of [
    "http://github.com/search?q=local+research",
    "https://github.com.evil.example/search?q=local+research",
    "https://github.com/settings/profile",
    "https://user@github.com/search?q=local+research",
    "https://github.com:8443/search?q=local+research",
    "https://127.0.0.1/search?q=local+research"
  ]) {
    assert.equal(normalizeGitHubSearchUrl(url), null, url);
  }

  assert.equal(
    normalizeGitHubSearchUrl("https://example.com/search?q=other", initial),
    null
  );
  assert.equal(
    normalizeGitHubSearchUrl("https://github.com/settings/profile", initial),
    null
  );
});
