import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { listDemoFixtures, writeDemoPackage } from "../demos";
import {
  compareDecisionReceipts,
  renderDecisionReceiptComparison,
  verifyReceiptDirectory
} from "../lib/receipt";

test("deterministic demo packages include a verifiable decision receipt", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-"));
  try {
    const written = writeDemoPackage({
      id: listDemoFixtures()[0]!.id,
      outputDir: tempDir
    });
    const result = verifyReceiptDirectory(written.outputDir);
    assert.equal(result.valid, true, result.errors.join("; "));
    assert.ok(result.checkedFiles >= 8);
    assert.equal(result.receipt?.schemaVersion, 1);
    assert.equal(result.receipt?.provenance.kind, "deterministic-demo");
    assert.ok((result.receipt?.claims.length ?? 0) > 0);
    assert.ok(result.receipt?.claims.every((claim) => claim.evidence.length > 0));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("receipt verification identifies tampered artifacts and unsupported source URLs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-tamper-"));
  try {
    const written = writeDemoPackage({
      id: "local-first-risk-review",
      outputDir: tempDir
    });
    fs.appendFileSync(written.reportPath, "\nTampered after export.\n", "utf8");
    const tampered = verifyReceiptDirectory(tempDir);
    assert.equal(tampered.valid, false);
    assert.ok(tampered.errors.some((error) => error.includes("integrity hash mismatch: report.md")));

    const receiptPath = path.join(tempDir, "receipt.json");
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as { sources: Array<{ url: string }> };
    receipt.sources[0]!.url = "javascript:alert(1)";
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const unsafe = verifyReceiptDirectory(tempDir);
    assert.equal(unsafe.valid, false);
    assert.ok(unsafe.errors.some((error) => error.includes("unsafe source URL")));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("decision receipt comparison explains source, claim, and decision changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-diff-"));
  try {
    const earlierDir = path.join(root, "earlier");
    const laterDir = path.join(root, "later");
    writeDemoPackage({ id: "browser-agent-landscape", outputDir: earlierDir });
    writeDemoPackage({ id: "local-first-risk-review", outputDir: laterDir });
    const earlier = verifyReceiptDirectory(earlierDir);
    const later = verifyReceiptDirectory(laterDir);
    assert.equal(earlier.valid, true, earlier.errors.join("; "));
    assert.equal(later.valid, true, later.errors.join("; "));

    const comparison = compareDecisionReceipts(earlier.receipt!, later.receipt!);
    assert.equal(comparison.decisionChanged, true);
    assert.equal(comparison.newSources.length, 3);
    assert.equal(comparison.disappearedSources.length, 3);
    assert.ok(comparison.changedBecause.length >= 3);
    assert.match(renderDecisionReceiptComparison(comparison), /Decision changed because/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
