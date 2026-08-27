import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

import { strToU8, zipSync } from "fflate";
import {
  compareDecisionReceipts,
  verifyReceiptBundle,
  type DecisionReceipt,
  type ReceiptBundle
} from "../../packages/decision-receipt/dist";

interface EmbeddedFixture {
  label: string;
  files: Record<string, string>;
}

function embeddedFixtures(): Record<string, EmbeddedFixture> {
  const context: Record<string, unknown> = {};
  vm.runInNewContext(fs.readFileSync("docs/assets/web-verifier-fixtures.js", "utf8"), context);
  return context.WEB_VERIFIER_FIXTURES as Record<string, EmbeddedFixture>;
}

function browserVerifier(): {
  unpackReceiptZip(input: Uint8Array): Promise<ReceiptBundle>;
  verifyReceiptBundle(input: ReceiptBundle): ReturnType<typeof verifyReceiptBundle>;
} {
  const context: Record<string, unknown> = {
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    URL,
    atob,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(fs.readFileSync("docs/assets/decision-receipt-verifier.js", "utf8"), context);
  return context.DecisionReceiptVerifier as ReturnType<typeof browserVerifier>;
}

test("local verifier page exposes folder, ZIP, fixtures, diff, and privacy-safe report controls", () => {
  const html = fs.readFileSync("docs/verify.html", "utf8");
  const app = fs.readFileSync("docs/verifier.js", "utf8");
  const css = fs.readFileSync("docs/verifier.css", "utf8");
  assert.match(html, /webkitdirectory/);
  assert.match(html, /accept="\.zip,application\/zip"/);
  assert.match(html, /No upload path exists/);
  assert.match(html, /Integrity verified ≠ decision is true/);
  assert.match(html, /verification-report\.json/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(app, /Synthesis \/ claims/);
  assert.match(app, /privateReceiptDataIncluded/);
  assert.doesNotMatch(app, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage)\b/);
  const scriptSources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scriptSources, [
    "assets/decision-receipt-verifier.js",
    "assets/web-verifier-fixtures.js",
    "verifier.js"
  ]);
  assert.ok(fs.statSync("docs/assets/decision-receipt-verifier.js").size < 40_000);
});

test("embedded valid, tampered, and changed fixtures preserve their promised outcomes", async () => {
  const fixtures = embeddedFixtures();
  assert.deepEqual(Object.keys(fixtures), ["valid", "tampered", "changed"]);
  const valid = await verifyReceiptBundle(fixtures.valid!.files);
  const tampered = await verifyReceiptBundle(fixtures.tampered!.files);
  const changed = await verifyReceiptBundle(fixtures.changed!.files);
  assert.equal(valid.valid, true, valid.errors.join("; "));
  assert.equal(tampered.valid, false);
  assert.ok(tampered.issues.some((issue) => issue.code === "integrity_hash_mismatch" && issue.message.includes("evidence/source.md")));
  assert.equal(changed.valid, true, changed.errors.join("; "));
  const comparison = compareDecisionReceipts(valid.receipt!, changed.receipt!);
  assert.equal(comparison.changes.sources, true);
  assert.equal(comparison.changes.policy, true);
  assert.equal(comparison.changes.model, true);
  assert.equal(comparison.changes.prompt, true);
  assert.equal(comparison.changes.claims, true);
  assert.equal(comparison.changes.decision, true);
});

test("actual browser bundle streams a rooted ZIP and rejects path traversal", async () => {
  const verifier = browserVerifier();
  const fixture = embeddedFixtures().valid!;
  const rooted = Object.fromEntries(Object.entries(fixture.files).map(([name, content]) => [`receipt-package/${name}`, strToU8(content)]));
  const unpacked = await verifier.unpackReceiptZip(zipSync(rooted));
  assert.ok("receipt.json" in unpacked);
  assert.ok("integrity-manifest.json" in unpacked);
  const verification = await verifier.verifyReceiptBundle(unpacked);
  assert.equal(verification.valid, true, verification.errors.join("; "));

  await assert.rejects(
    verifier.unpackReceiptZip(zipSync({ "../private.txt": strToU8("private") })),
    /unsafe path/
  );
});

test("default verification report code omits receipt text and source data", () => {
  const app = fs.readFileSync("docs/verifier.js", "utf8");
  const privateBlock = app.indexOf("...(includePrivate ?");
  const privacyMarker = app.indexOf("privateReceiptDataIncluded");
  assert.ok(privateBlock > 0 && privacyMarker > privateBlock);
  const publicPrefix = app.slice(app.indexOf("const report ="), privateBlock);
  assert.doesNotMatch(publicPrefix, /decision:\s*receipt|claims:\s*receipt|sources:\s*receipt|limitations:\s*receipt/);
});
