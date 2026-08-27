import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { validateDecisionReceiptAdapterResult } from "../lib/adapter-contract";
import { verifyReceiptDirectory } from "../lib/receipt";

const browserUseDir = path.join(process.cwd(), "examples", "interop", "runs", "browser-use");
const gptResearcherDir = path.join(process.cwd(), "examples", "interop", "runs", "gpt-researcher");

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

test("authentic GPT Researcher projection preserves the low-disk and private-reasoning boundary", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(gptResearcherDir, "engine-output.json"), "utf8")) as {
    engine: string;
    engineVersion: string;
    runId: string;
    reportProjection: string;
    rawReportSha256: string;
    reasoningRedacted: boolean;
    visitedUrls: string[];
    limits: Record<string, boolean>;
  };
  assert.equal(raw.engine, "GPT Researcher");
  assert.equal(raw.engineVersion, "0.16.0");
  assert.match(raw.runId, /^research_[a-f0-9]{12}$/);
  assert.equal(raw.reasoningRedacted, true);
  assert.doesNotMatch(raw.reportProjection, /<\/?think\b/i);
  assert.match(raw.rawReportSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(raw.visitedUrls, []);
  assert.deepEqual(raw.limits, {
    preloadedRedistributableContext: true,
    retrievalSkippedToAvoidSecondEmbeddingModel: true,
    webSearch: false,
    mcp: false,
    authenticatedSession: false,
    rawReasoningPublished: false
  });

  const adapted = JSON.parse(fs.readFileSync(path.join(gptResearcherDir, "adapter-result.json"), "utf8"));
  const validation = validateDecisionReceiptAdapterResult(adapted);
  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.equal(adapted.producer.fixture, false);
  assert.equal(adapted.producer.runId, raw.runId);
  assert.equal(adapted.sources[0].origin.kind, "captured");
  assert.equal(adapted.claims[0].origin.kind, "inferred");
  assert.ok(adapted.limitations.some((item: string) => item.includes("second embedding model")));

  const receipt = verifyReceiptDirectory(path.join(gptResearcherDir, "receipt"));
  assert.equal(receipt.valid, true, receipt.errors.join("; "));
  assert.equal(receipt.receipt?.provenance.fixture, false);
  assert.equal(receipt.receipt?.provenance.runId, raw.runId);
  assert.equal(receipt.receipt?.sources[0]?.captureType, "imported-excerpt");
});
