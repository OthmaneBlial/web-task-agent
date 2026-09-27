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
  type ExternalDecisionResult,
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

test("invalid forced imports preserve the existing verified receipt package", () => {
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8")) as DecisionReceiptAdapterResult;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-preserve-"));
  try {
    const written = importExternalDecisionResult({ result: input, outputDir });
    const packagePaths = [written.receiptPath, written.integrityManifestPath, ...written.snapshotPaths];
    const originalFiles = packagePaths.map((filePath) => fs.readFileSync(filePath));
    const source = input.sources[0]!;
    const invalidResult: ExternalDecisionResult = {
      title: "Invalid replacement",
      summary: "This must fail without changing the existing package.",
      sources: [{
        id: source.id,
        title: source.title,
        url: source.url,
        excerpt: "This changed excerpt would corrupt the old manifest."
      }],
      claims: [{
        id: "claim-invalid-source",
        text: "This claim must be rejected.",
        evidence: [{ sourceId: "missing-source" }]
      }]
    };

    assert.throws(
      () => importExternalDecisionResult({ result: invalidResult, outputDir, force: true }),
      /references an unknown source/
    );
    assert.deepEqual(packagePaths.map((filePath) => fs.readFileSync(filePath)), originalFiles);
    assert.equal(verifyReceiptDirectory(outputDir).valid, true);
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

test("receipt import never writes snapshots through package symlinks or hard links", () => {
  if (process.platform === "win32") return;
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8")) as DecisionReceiptAdapterResult;
  const firstSource = input.sources[0]!;
  const sourceId = (firstSource.id || firstSource.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source-1";
  const snapshotName = `01-${sourceId}.md`;

  for (const linkPath of ["evidence", "evidence/snapshots", `evidence/snapshots/${snapshotName}`]) {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-symlink-"));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-outside-"));
    try {
      const link = path.join(outputDir, linkPath);
      fs.mkdirSync(path.dirname(link), { recursive: true });
      if (linkPath.endsWith(".md")) {
        const victim = path.join(outsideDir, "victim.md");
        fs.writeFileSync(victim, "keep this file unchanged", "utf8");
        fs.symlinkSync(victim, link, "file");
      } else {
        fs.symlinkSync(outsideDir, link, "dir");
      }

      assert.throws(
        () => importExternalDecisionResult({ result: input, outputDir, force: true }),
        /symbolic link|symlink|unsafe|regular file|receipt artifact/
      );
      if (linkPath.endsWith(".md")) {
        assert.equal(fs.readFileSync(path.join(outsideDir, "victim.md"), "utf8"), "keep this file unchanged");
      } else {
        assert.deepEqual(fs.readdirSync(outsideDir), []);
      }
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-hardlink-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-hardlink-outside-"));
  try {
    const link = path.join(outputDir, "evidence", "snapshots", snapshotName);
    const victim = path.join(outsideDir, "victim.md");
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.writeFileSync(victim, "keep this file unchanged", "utf8");
    fs.linkSync(victim, link);

    assert.throws(
      () => importExternalDecisionResult({ result: input, outputDir, force: true }),
      /unsafe receipt snapshot file/
    );
    assert.equal(fs.readFileSync(victim, "utf8"), "keep this file unchanged");
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test("receipt imports store snapshots with private file permissions", () => {
  if (process.platform === "win32") return;
  const result = JSON.parse(fs.readFileSync(path.join(process.cwd(), "examples", "interop", "browser-use-result.json"), "utf8")) as DecisionReceiptAdapterResult;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-interop-private-"));

  try {
    const imported = importExternalDecisionResult({ result, outputDir });
    for (const snapshotPath of imported.snapshotPaths) {
      assert.equal(fs.statSync(snapshotPath).mode & 0o777, 0o600);
    }
    assert.equal(verifyReceiptDirectory(outputDir).valid, true);
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

  const cases = [
    { id: "valid-lowercase-date-time", expected: true, change: (value: typeof input) => { value.producer.exportedAt = "2026-08-27t00:00:00.000z"; } },
    { id: "invalid-human-date", expected: false, change: (value: typeof input) => { value.producer.exportedAt = "January 1, 2025"; } },
    { id: "invalid-calendar-date", expected: false, change: (value: typeof input) => { value.sources[0].collectedAt = "2025-02-30T00:00:00Z"; } },
    { id: "valid-maximum-url-port", expected: true, change: (value: typeof input) => { value.sources[0].url = "https://example.com:65535/path"; } },
    { id: "invalid-url-space", expected: false, change: (value: typeof input) => { value.sources[0].url = "https://example.com/a b"; } },
    { id: "invalid-url-escape", expected: false, change: (value: typeof input) => { value.sources[0].url = "https://example.com/%zz"; } },
    { id: "invalid-url-unicode", expected: false, change: (value: typeof input) => { value.sources[0].url = "https://example.com/é"; } },
    { id: "invalid-url-port-overflow", expected: false, change: (value: typeof input) => { value.sources[0].url = "https://example.com:65536/path"; } },
    { id: "invalid-url-credentials", expected: false, change: (value: typeof input) => { value.sources[0].url = "https://user:password@example.com/path"; } }
  ];
  for (const testCase of cases) {
    const candidate = structuredClone(input);
    testCase.change(candidate);
    const runtime = validateDecisionReceiptAdapterResult(candidate);
    const independent = ajv.validate(schema, candidate);
    assert.equal(runtime.valid, testCase.expected, `${testCase.id}: ${runtime.errors.join("; ")}`);
    assert.equal(independent, testCase.expected, `${testCase.id}: ${ajv.errorsText(ajv.errors)}`);
  }
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
