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
  compareDecisionReceipts: typeof compareDecisionReceipts;
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
  assert.match(app, /Next validation/);
  assert.match(app, /Show exact changes/);
  assert.match(app, /comparison\.changedSources\.forEach/);
  assert.match(app, /snapshotSha256/);
  assert.match(app, /comparison\.changedClaims\.forEach/);
  assert.match(app, /privateReceiptDataIncluded/);
  assert.match(app, /const bundle = Object\.create\(null\)/);
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

  const missingReceiptCoverage = { ...unpacked };
  const manifest = JSON.parse(new TextDecoder().decode(missingReceiptCoverage["integrity-manifest.json"] as Uint8Array)) as {
    files: Array<{ path: string; sha256: string; bytes: number }>;
  };
  manifest.files = manifest.files.filter((entry) => entry.path !== "receipt.json");
  missingReceiptCoverage["integrity-manifest.json"] = strToU8(JSON.stringify(manifest));
  const incomplete = await verifier.verifyReceiptBundle(missingReceiptCoverage);
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.issues.some((issue) => issue.code === "manifest_receipt_missing"));

  const wrongAlgorithm = { ...unpacked };
  const malformedManifest = JSON.parse(new TextDecoder().decode(wrongAlgorithm["integrity-manifest.json"] as Uint8Array)) as {
    algorithm: string;
    files: Array<{ path: string; sha256: string; bytes: number }>;
  };
  malformedManifest.algorithm = "md5";
  wrongAlgorithm["integrity-manifest.json"] = strToU8(JSON.stringify(malformedManifest));
  const malformed = await verifier.verifyReceiptBundle(wrongAlgorithm);
  assert.equal(malformed.valid, false);
  assert.ok(malformed.issues.some((issue) => issue.code === "manifest_contract_invalid"));

  const duplicateManifestBundle = { ...unpacked };
  const duplicateManifest = JSON.parse(new TextDecoder().decode(duplicateManifestBundle["integrity-manifest.json"] as Uint8Array)) as {
    files: Array<{ path: string; sha256: string; bytes: number }>;
  };
  duplicateManifest.files.push({ ...duplicateManifest.files[0]! });
  duplicateManifestBundle["integrity-manifest.json"] = strToU8(JSON.stringify(duplicateManifest));
  const duplicated = await verifier.verifyReceiptBundle(duplicateManifestBundle);
  assert.equal(duplicated.valid, false);
  assert.ok(duplicated.issues.some((issue) => issue.code === "manifest_path_duplicate"));

  const magicPathArchive = zipSync({ "payload99": strToU8("preserved") });
  const oldName = strToU8("payload99");
  const magicName = strToU8("__proto__");
  for (let offset = 0; offset <= magicPathArchive.length - oldName.length; offset += 1) {
    if (oldName.every((byte, index) => magicPathArchive[offset + index] === byte)) {
      magicPathArchive.set(magicName, offset);
      offset += oldName.length - 1;
    }
  }
  const magicFilename = await verifier.unpackReceiptZip(magicPathArchive);
  assert.equal(Object.hasOwn(magicFilename, "__proto__"), true);
  assert.equal(new TextDecoder().decode(magicFilename["__proto__"] as Uint8Array), "preserved");

  const duplicatePathArchive = zipSync({ "first.txt": strToU8("first"), "other.txt": strToU8("second") });
  const originalName = strToU8("other.txt");
  const duplicateName = strToU8("first.txt");
  for (let offset = 0; offset <= duplicatePathArchive.length - originalName.length; offset += 1) {
    if (originalName.every((byte, index) => duplicatePathArchive[offset + index] === byte)) {
      duplicatePathArchive.set(duplicateName, offset);
      offset += originalName.length - 1;
    }
  }
  await assert.rejects(verifier.unpackReceiptZip(duplicatePathArchive), /duplicate path/);

  await assert.rejects(
    verifier.unpackReceiptZip(zipSync({ "../private.txt": strToU8("private") })),
    /unsafe path/
  );
});

test("browser verifier reports a changed snapshot when its source URL stays the same", () => {
  const fixture = embeddedFixtures().valid!;
  const receipt = JSON.parse(fixture.files["receipt.json"]!) as DecisionReceipt;
  const later = structuredClone(receipt);
  later.sources[0]!.snapshotSha256 = "b".repeat(64);

  const comparison = browserVerifier().compareDecisionReceipts(receipt, later);
  assert.equal(comparison.changes.sources, true);
  assert.equal(comparison.changedSources.length, 1);
});

test("default verification report code omits receipt text and source data", () => {
  const app = fs.readFileSync("docs/verifier.js", "utf8");
  const privateBlock = app.indexOf("...(includePrivate ?");
  const privacyMarker = app.indexOf("privateReceiptDataIncluded");
  assert.ok(privateBlock > 0 && privacyMarker > privateBlock);
  const publicPrefix = app.slice(app.indexOf("const report ="), privateBlock);
  assert.doesNotMatch(publicPrefix, /decision:\s*receipt|claims:\s*receipt|sources:\s*receipt|limitations:\s*receipt/);
});
