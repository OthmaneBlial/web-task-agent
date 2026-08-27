import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

import { verifyReceiptBundle } from "../../packages/decision-receipt/dist";

test("60-second challenge uses the real tampered fixture without a collection path", async () => {
  const html = fs.readFileSync("docs/challenge.html", "utf8");
  const app = fs.readFileSync("docs/challenge.js", "utf8");
  const css = fs.readFileSync("docs/challenge.css", "utf8");
  const verifierApp = fs.readFileSync("docs/verifier.js", "utf8");

  assert.match(html, /One receipt[\s\S]*One changed file[\s\S]*60 seconds/);
  assert.match(html, /No upload · no account · no telemetry/);
  assert.match(html, /Nothing is submitted, persisted, or scored remotely/);
  assert.match(html, /verify\.html\?fixture=tampered/);
  assert.equal((html.match(/data-answer=/g) || []).length, 4);
  assert.deepEqual(
    [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]),
    ["assets/decision-receipt-verifier.js", "assets/web-verifier-fixtures.js", "challenge.js"]
  );

  assert.match(app, /Core\.verifyReceiptBundle\(fixture\.files\)/);
  assert.match(app, /integrity_hash_mismatch/);
  assert.match(app, /performance\.now\(\)/);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(app, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage)\b/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(verifierApp, /URLSearchParams\(window\.location\.search\)/);
  assert.match(verifierApp, /\["valid", "tampered", "changed"\]/);

  const context: Record<string, unknown> = {};
  vm.runInNewContext(fs.readFileSync("docs/assets/web-verifier-fixtures.js", "utf8"), context);
  const fixtures = context.WEB_VERIFIER_FIXTURES as Record<string, { files: Record<string, string> }>;
  const verification = await verifyReceiptBundle(fixtures.tampered!.files);
  const exactFailure = verification.issues.find((issue) => issue.code === "integrity_hash_mismatch");
  assert.ok(exactFailure);
  assert.match(exactFailure.message, /evidence\/source\.md/);
  assert.equal(Buffer.byteLength(fixtures.tampered!.files["evidence/source.md"]!), 106);
});
