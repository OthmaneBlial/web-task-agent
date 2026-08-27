import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compareDecisionReceipts,
  migrateDecisionReceipt,
  renderDecisionReceiptComparison,
  validateDecisionReceipt,
  verifyReceiptBundle,
  type DecisionReceipt,
  type ReceiptBundle
} from "../../packages/decision-receipt/dist";

function readBundle(directory: string): ReceiptBundle {
  const bundle: ReceiptBundle = {};
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else bundle[path.relative(directory, absolute).split(path.sep).join("/")] = fs.readFileSync(absolute);
    }
  };
  visit(directory);
  return bundle;
}

function exampleReceipt(kind: string): DecisionReceipt {
  return JSON.parse(fs.readFileSync(path.join("examples", "receipt-spec", kind, "receipt.json"), "utf8")) as DecisionReceipt;
}

test("standalone core verifies every public example and identifies the falsified bytes", async () => {
  for (const kind of ["minimal", "full", "contradicted", "incomplete", "stale", "signed"]) {
    const verification = await verifyReceiptBundle(readBundle(path.join("examples", "receipt-spec", kind)));
    assert.equal(verification.valid, true, `${kind}: ${verification.errors.join("; ")}`);
    if (kind === "signed") assert.equal(verification.signatureVerified, true);
  }
  const tampered = await verifyReceiptBundle(readBundle(path.join("examples", "receipt-spec", "tampered")));
  assert.equal(tampered.valid, false);
  assert.ok(tampered.issues.some((issue) => issue.code === "integrity_hash_mismatch" && issue.message.includes("evidence/source.md")));

  const malformedBundle = readBundle(path.join("examples", "receipt-spec", "minimal"));
  const malformedManifest = JSON.parse(String(malformedBundle["integrity-manifest.json"])) as { files: unknown[] };
  malformedManifest.files = [null];
  malformedBundle["integrity-manifest.json"] = JSON.stringify(malformedManifest);
  const malformed = await verifyReceiptBundle(malformedBundle);
  assert.equal(malformed.valid, false);
  assert.ok(malformed.issues.some((issue) => issue.code === "manifest_file_invalid"));
});

test("experimental schema-v1 receipts migrate once and unknown versions fail closed", () => {
  const legacy = exampleReceipt("minimal") as unknown as Record<string, unknown>;
  delete legacy.specVersion;
  delete legacy.profile;
  const migration = migrateDecisionReceipt(legacy);
  assert.equal(migration.migrated, true);
  assert.equal(migration.from, "1-experimental");
  assert.equal(migration.receipt.specVersion, "1.0.0");
  assert.equal(migration.receipt.profile, "full");
  assert.equal(validateDecisionReceipt(migration.receipt).valid, true);

  const unknown = { ...exampleReceipt("minimal"), specVersion: "9.0.0" };
  assert.equal(validateDecisionReceipt(unknown).issues.some((issue) => issue.code === "spec_version_unsupported"), true);
  assert.throws(() => migrateDecisionReceipt(unknown), /Unsupported Decision Receipt spec version/);
});

test("core diff separates source, policy, model, prompt, claim, and decision changes", () => {
  const earlier = exampleReceipt("full");
  const later = structuredClone(earlier);
  later.provenance.policyVersion = "source-policy-v2";
  later.provenance.model = "provider/model-v2";
  later.provenance.promptVersion = "synthesis-v2";
  later.decision.summary = "Changed after independent validation.";
  later.claims[0]!.text = "The evidence changed after export.";
  later.sources.push({ ...later.sources[0]!, id: "source-2", url: "https://example.org/new-evidence" });
  const comparison = compareDecisionReceipts(earlier, later);
  assert.deepEqual(comparison.changes, {
    sources: true,
    claims: true,
    policy: true,
    model: true,
    prompt: true,
    decision: true
  });
  const markdown = renderDecisionReceiptComparison(comparison);
  assert.match(markdown, /Policy changed: yes/);
  assert.match(markdown, /Model changed: yes/);
  assert.match(markdown, /Prompt contract changed: yes/);
});

test("a clean TypeScript project installs only the core tarball and renders a diff", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-consumer-"));
  try {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", tempDir], {
      cwd: path.resolve("packages", "decision-receipt"),
      encoding: "utf8"
    })) as Array<{ filename: string; unpackedSize: number }>;
    assert.ok(pack[0]!.unpackedSize <= 180_000, `core unpacked size ${pack[0]!.unpackedSize} exceeds 180 KB`);
    const tarball = path.join(tempDir, pack[0]!.filename);
    execFileSync("npm", ["init", "-y"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", tarball], { cwd: tempDir, stdio: "ignore" });
    const source = [
      'import { compareDecisionReceipts, renderDecisionReceiptComparison, validateDecisionReceipt } from "@othmaneblial/decision-receipt";',
      `const receipt = ${JSON.stringify(exampleReceipt("minimal"))};`,
      "const validation = validateDecisionReceipt(receipt);",
      "if (!validation.valid || !validation.receipt) throw new Error(validation.errors.join('; '));",
      "const later = structuredClone(validation.receipt);",
      "later.decision.summary = 'Changed in a clean consumer project.';",
      "const output = renderDecisionReceiptComparison(compareDecisionReceipts(validation.receipt, later));",
      "if (!output.includes('Decision changed: yes')) throw new Error(output);"
    ].join("\n");
    fs.writeFileSync(path.join(tempDir, "consumer.ts"), `${source}\n`, "utf8");
    execFileSync(path.resolve("node_modules", ".bin", "tsc"), [
      "--strict", "--target", "ES2022", "--module", "CommonJS", "--moduleResolution", "Node", "--lib", "ES2022,DOM", "consumer.ts"
    ], { cwd: tempDir, stdio: "pipe" });
    execFileSync("node", ["consumer.js"], { cwd: tempDir, stdio: "pipe" });
    fs.writeFileSync(path.join(tempDir, "consumer.mjs"), [
      'import core from "@othmaneblial/decision-receipt";',
      "if (typeof core.validateDecisionReceipt !== 'function') throw new Error('ESM interoperability failed');"
    ].join("\n"), "utf8");
    execFileSync("node", ["consumer.mjs"], { cwd: tempDir, stdio: "pipe" });
    const cliOutput = execFileSync(path.join(tempDir, "node_modules", ".bin", "decision-receipt"), [
      "verify", path.resolve("examples", "receipt-spec", "minimal")
    ], { cwd: tempDir, encoding: "utf8" });
    assert.match(cliOutput, /integrity verified/);
    assert.match(cliOutput, /integrity is not proof/);
    const installed = JSON.parse(fs.readFileSync(path.join(tempDir, "node_modules", "@othmaneblial", "decision-receipt", "package.json"), "utf8")) as { dependencies?: unknown };
    assert.equal(installed.dependencies, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
