import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  importExternalDecisionResult,
  signReceiptDirectory,
  verifyReceiptDirectory,
  type ExternalDecisionResult
} from "../lib/receipt";

test("external provider result imports into a verified receipt without provider coupling", () => {
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8")) as ExternalDecisionResult;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-"));
  try {
    const written = importExternalDecisionResult({ result: input, outputDir });
    assert.equal(written.snapshotPaths.length, 2);
    const verification = verifyReceiptDirectory(outputDir);
    assert.equal(verification.valid, true, verification.errors.join("; "));
    assert.equal(verification.receipt?.provenance.kind, "imported");
    assert.equal(verification.receipt?.provenance.fixture, false);
    assert.ok(verification.receipt?.limitations.some((item) => item.includes("Imported evidence")));
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test("interop adapter preserves the source boundary", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-unsafe-"));
  try {
    assert.throws(() => importExternalDecisionResult({
      outputDir,
      result: {
        title: "Unsafe import",
        summary: "Should fail closed.",
        sources: [{ title: "Unsafe", url: "http://user:password@example.com", excerpt: "No." }]
      }
    }), /denied by source policy/);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test("checked-in interop fixture remains verifiable", () => {
  const verification = verifyReceiptDirectory(path.join(process.cwd(), "examples", "interop", "imported-receipt"));
  assert.equal(verification.valid, true, verification.errors.join("; "));
  assert.equal(verification.receipt?.provenance.kind, "imported");
});

test("operator signature is optional, verifiable, and clearly scoped", () => {
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8")) as ExternalDecisionResult;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-signed-"));
  try {
    importExternalDecisionResult({ result: input, outputDir });
    const keys = generateKeyPairSync("ed25519");
    signReceiptDirectory({
      directory: outputDir,
      privateKey: keys.privateKey,
      keyId: "test-maintainer-key"
    });
    const verification = verifyReceiptDirectory(outputDir);
    assert.equal(verification.valid, true, verification.errors.join("; "));
    assert.equal(verification.receipt?.signature?.algorithm, "ed25519");
    assert.equal(verification.receipt?.signature?.keyId, "test-maintainer-key");

    const receiptPath = path.join(outputDir, "receipt.json");
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as { signature: { signatureBase64: string } };
    receipt.signature.signatureBase64 = `${receipt.signature.signatureBase64.slice(0, -2)}xx`;
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    assert.equal(verifyReceiptDirectory(outputDir).valid, false);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
