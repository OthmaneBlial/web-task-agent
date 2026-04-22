import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProvidedSourceSeedResult,
  enrichProvidedSourceSeedResult
} from "../tasks/agent/direct-source";

test("direct-source enrichment normalizes Play Store and AppBrain app titles", async () => {
  const play = await enrichProvidedSourceSeedResult(
    buildProvidedSourceSeedResult("https://play.google.com/store/apps/details?id=com.nanocv.app")
  );
  const appbrain = await enrichProvidedSourceSeedResult(
    buildProvidedSourceSeedResult("https://www.appbrain.com/app/nanocv-offline-resume-builder/com.nanocv.app")
  );

  assert.equal(play.title, "Resume Builder Offline");
  assert.equal(appbrain.title, "Resume Builder Offline");
  assert.equal(play.reviewStatus, "read");
  assert.equal(appbrain.reviewStatus, "read");
});
