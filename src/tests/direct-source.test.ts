import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProvidedSourceSeedResult,
  enrichProvidedSourceSeedResult,
  isDirectAppUrl,
  parseAppBrainAppId,
  parsePlayStoreAppId
} from "../tasks/agent/direct-source";
import { fetchNanoCvMetadata } from "./fixtures/direct-app";

test("direct app URLs require the official HTTPS store hosts", () => {
  assert.equal(
    parsePlayStoreAppId("https://play.google.com/store/apps/details?id=com.example.app"),
    "com.example.app"
  );
  assert.equal(
    parseAppBrainAppId("https://www.appbrain.com/app/example/com.example.app"),
    "com.example.app"
  );
  assert.equal(parsePlayStoreAppId("https://play.google.com.attacker.example/store/apps/details?id=com.example.app"), null);
  assert.equal(parsePlayStoreAppId("https://evilplay.google.com/store/apps/details?id=com.example.app"), null);
  assert.equal(parsePlayStoreAppId("http://play.google.com/store/apps/details?id=com.example.app"), null);
  assert.equal(parseAppBrainAppId("https://appbrain.com.attacker.example/app/example/com.example.app"), null);
  assert.equal(isDirectAppUrl("https://play.google.com.attacker.example/store/apps/details?id=com.example.app"), false);
});

test("direct app URLs reject credentials and nonstandard ports before metadata fetch", async () => {
  const unsafeUrls = [
    "https://user:secret@play.google.com/store/apps/details?id=com.example.app",
    "https://play.google.com:444/store/apps/details?id=com.example.app",
    "https://user:secret@www.appbrain.com/app/example/com.example.app",
    "https://www.appbrain.com:444/app/example/com.example.app"
  ];

  for (const url of unsafeUrls) {
    let metadataFetches = 0;
    assert.equal(isDirectAppUrl(url), false, url);
    await enrichProvidedSourceSeedResult(buildProvidedSourceSeedResult(url), {
      fetchAppMetadata: async () => {
        metadataFetches += 1;
        return null;
      }
    });
    assert.equal(metadataFetches, 0, url);
  }
});

test("direct-source enrichment normalizes Play Store and AppBrain app titles", async () => {
  const play = await enrichProvidedSourceSeedResult(
    buildProvidedSourceSeedResult("https://play.google.com/store/apps/details?id=com.nanocv.app"),
    { fetchAppMetadata: fetchNanoCvMetadata }
  );
  const appbrain = await enrichProvidedSourceSeedResult(
    buildProvidedSourceSeedResult("https://www.appbrain.com/app/nanocv-offline-resume-builder/com.nanocv.app"),
    { fetchAppMetadata: fetchNanoCvMetadata }
  );

  assert.equal(play.title, "Resume Builder Offline");
  assert.equal(appbrain.title, "Resume Builder Offline");
  assert.equal(play.reviewStatus, "read");
  assert.equal(appbrain.reviewStatus, "read");
});
