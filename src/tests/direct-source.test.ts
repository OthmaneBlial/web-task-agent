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

test("oversized Play Store responses do not become read evidence", async () => {
  const originalFetch = globalThis.fetch;
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));
    },
    cancel() {
      canceled = true;
    }
  });
  const response = new Response(body, { status: 200 });
  response.text = async () => "<html></html>";
  globalThis.fetch = async () => response;

  try {
    const result = await enrichProvidedSourceSeedResult(
      buildProvidedSourceSeedResult("https://play.google.com/store/apps/details?id=com.example.app")
    );

    assert.notEqual(result.reviewStatus, "read");
    assert.equal(canceled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Play Store metadata never follows a redirect outside the official HTTPS host", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; redirect?: RequestRedirect }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), redirect: init?.redirect });
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" }
    });
  };

  try {
    const result = await enrichProvidedSourceSeedResult(
      buildProvidedSourceSeedResult("https://play.google.com/store/apps/details?id=com.example.app")
    );

    assert.notEqual(result.reviewStatus, "read");
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.redirect, "manual");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Play Store metadata follows safe same-host redirects", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; redirect?: RequestRedirect }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), redirect: init?.redirect });
    if (requests.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "/store/apps/details?id=com.example.app&hl=en&gl=us" }
      });
    }
    return new Response("<html><title>Example App</title><h1>Example App</h1></html>", { status: 200 });
  };

  try {
    const result = await enrichProvidedSourceSeedResult(
      buildProvidedSourceSeedResult("https://play.google.com/store/apps/details?id=com.example.app")
    );

    assert.equal(result.reviewStatus, "read");
    assert.ok(result.title.length > 0);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(({ url, redirect }) =>
      new URL(url).hostname === "play.google.com" && redirect === "manual"
    ));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Play Store metadata stops after five same-host redirects", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "/store/apps/details?id=com.example.app&hl=en&gl=us" }
    });
  };

  try {
    const result = await enrichProvidedSourceSeedResult(
      buildProvidedSourceSeedResult("https://play.google.com/store/apps/details?id=com.example.app")
    );

    assert.notEqual(result.reviewStatus, "read");
    assert.equal(requests, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
