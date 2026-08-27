import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { validateDecisionReceiptAdapterResult } from "../lib/adapter-contract";
import { verifyReceiptDirectory } from "../lib/receipt";

const browserUseDir = path.join(process.cwd(), "examples", "interop", "runs", "browser-use");

test("authentic Browser Use projection preserves the strict privacy and provenance boundary", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(browserUseDir, "engine-output.json"), "utf8")) as {
    engine: string;
    engineVersion: string;
    runId: string;
    source: { markdown: string; url: string };
    modelOutput: { paragraph: string };
    limits: Record<string, boolean>;
  };
  assert.equal(raw.engine, "Browser Use");
  assert.equal(raw.engineVersion, "0.13.8");
  assert.match(raw.runId, /^browser-use-\d{8}T\d{6}Z$/);
  assert.equal(raw.source.url, "https://example.com/");
  assert.ok(raw.source.markdown.includes(raw.modelOutput.paragraph));
  assert.deepEqual(raw.limits, {
    allowedDomains: ["example.com"],
    telemetry: false,
    cloudSync: false,
    authenticatedSession: false,
    screenshotCaptured: false
  });

  const adapted = JSON.parse(fs.readFileSync(path.join(browserUseDir, "adapter-result.json"), "utf8"));
  const validation = validateDecisionReceiptAdapterResult(adapted);
  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.equal(adapted.producer.fixture, false);
  assert.equal(adapted.sources[0].origin.kind, "captured");
  assert.equal(adapted.claims[0].origin.kind, "inferred");

  const receipt = verifyReceiptDirectory(path.join(browserUseDir, "receipt"));
  assert.equal(receipt.valid, true, receipt.errors.join("; "));
  assert.equal(receipt.receipt?.provenance.fixture, false);
  assert.equal(receipt.receipt?.provenance.runId, raw.runId);
  assert.equal(receipt.receipt?.sources[0]?.captureType, "imported-excerpt");
});
