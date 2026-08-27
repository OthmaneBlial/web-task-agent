import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import {
  validateDecisionReceiptAdapterResult,
  type DecisionReceiptAdapterResult
} from "../lib/adapter-contract";
import {
  importExternalDecisionResult,
  signReceiptDirectory,
  verifyReceiptDirectory,
} from "../lib/receipt";

test("external provider result imports into a verified receipt without provider coupling", () => {
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8")) as DecisionReceiptAdapterResult;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-"));
  try {
    const written = importExternalDecisionResult({ result: input, outputDir });
    assert.equal(written.snapshotPaths.length, 2);
    const verification = verifyReceiptDirectory(outputDir);
    assert.equal(verification.valid, true, verification.errors.join("; "));
    assert.equal(verification.receipt?.provenance.kind, "imported");
    assert.equal(verification.receipt?.provenance.fixture, true);
    assert.equal(verification.receipt?.decision.adapterOrigin?.kind, "operator-attested");
    assert.equal(verification.receipt?.sources[0]?.captureType, "imported-excerpt");
    assert.equal(verification.receipt?.sources[0]?.adapterOrigin?.kind, "operator-attested");
    assert.equal(verification.receipt?.claims[0]?.evidence[0]?.id, "evidence-offline-export");
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
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8")) as DecisionReceiptAdapterResult;
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

test("adapter contract agrees with independent JSON Schema validation", () => {
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8"));
  const runtime = validateDecisionReceiptAdapterResult(input);
  assert.equal(runtime.valid, true, runtime.errors.join("; "));
  const schema = JSON.parse(fs.readFileSync(path.join(process.cwd(), "schema", "decision-receipt-adapter.v1.schema.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  assert.equal(ajv.validate(schema, input), true, ajv.errorsText(ajv.errors));
});

test("adapter contract rejects provider-private fields and unlabeled inference", () => {
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8")) as Record<string, unknown>;
  const withSession = structuredClone(input) as Record<string, unknown>;
  withSession.session = { cookie: "private" };
  const privateValidation = validateDecisionReceiptAdapterResult(withSession);
  assert.equal(privateValidation.valid, false);
  assert.ok(privateValidation.errors.some((error) => error.includes("forbidden provider-private")));

  const unlabeled = structuredClone(input) as { claims: Array<{ origin: { kind: string; note: string | null } }> };
  unlabeled.claims[0]!.origin = { kind: "inferred", note: null };
  const inferenceValidation = validateDecisionReceiptAdapterResult(unlabeled);
  assert.equal(inferenceValidation.valid, false);
  assert.ok(inferenceValidation.errors.some((error) => error.includes("inferred and operator-attested values require an explicit note")));
});
