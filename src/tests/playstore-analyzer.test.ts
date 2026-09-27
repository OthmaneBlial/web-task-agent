import assert from "node:assert/strict";
import test from "node:test";

import { buildPlayStoreDetailUrl } from "../tasks/playstore-analyzer";

test("Play Store detail URLs keep untrusted app IDs inside the id parameter", () => {
  const appId = "com.example.app&redirect=http://127.0.0.1/#fragment";
  const url = new URL(buildPlayStoreDetailUrl(appId));

  assert.equal(url.origin, "https://play.google.com");
  assert.equal(url.pathname, "/store/apps/details");
  assert.equal(url.searchParams.get("id"), appId);
  assert.equal(url.searchParams.get("redirect"), null);
  assert.equal(url.hash, "");
});
