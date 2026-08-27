import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAdapterScaffold } from "../lib/adapter-scaffold";
import { validateDecisionReceiptAdapterResult } from "../lib/adapter-contract";

test("adapter generator creates a strict scaffold whose fixture passes the shared contract", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-adapter-"));
  const outputDir = path.join(root, "sample-adapter");
  try {
    const written = createAdapterScaffold({
      id: "Sample Engine",
      engine: "Sample Engine",
      engineVersion: "1.2.3",
      outputDir
    });
    const adapted = JSON.parse(execFileSync(process.execPath, [written.adapterPath, written.fixturePath], { encoding: "utf8" }));
    const validation = validateDecisionReceiptAdapterResult(adapted);
    assert.equal(validation.valid, true, validation.errors.join("; "));
    assert.equal(validation.result?.producer.adapterId, "sample-engine");
    assert.equal(validation.result?.producer.engineVersion, "1.2.3");
    assert.ok(validation.result?.sources.every((source) => source.origin.kind === "captured"));
    assert.ok(validation.result?.claims.every((claim) => claim.origin.kind === "imported"));
    assert.throws(() => createAdapterScaffold({
      id: "Sample Engine",
      engine: "Sample Engine",
      engineVersion: "1.2.3",
      outputDir
    }), /refusing to overwrite/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
