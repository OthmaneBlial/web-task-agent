import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  const bundle = Object.create(null) as ReceiptBundle;
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

test("standalone CLI redacts local home paths in errors", () => {
  const cliPath = path.resolve("packages", "decision-receipt", "dist", "cli.js");
  const missingPath = path.join(
    os.homedir(),
    "decision-receipt-test-missing-" + process.pid,
    "password=example-secret"
  );
  const result = spawnSync(process.execPath, [cliPath, "verify", missingPath], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[LOCAL_PATH\]/);
  assert.doesNotMatch(result.stderr, /example-secret/);
  assert.equal(result.stderr.includes(os.homedir()), false);
});

test("standalone CLI bounds total filesystem entries", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-entry-limit-"));
  try {
    for (let index = 0; index <= 2_000; index += 1) {
      fs.mkdirSync(path.join(tempDir, "dir-" + index));
    }
    const cliPath = path.resolve("packages", "decision-receipt", "dist", "cli.js");
    const result = spawnSync(process.execPath, [cliPath, "verify", tempDir], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /2000 filesystem entries/);
    assert.doesNotMatch(result.stdout, /integrity verified/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("receipt manifest covers receipt.json and every referenced source snapshot", async () => {
  const original = readBundle(path.join("packages", "decision-receipt", "examples", "minimal"));
  const receipt = JSON.parse(String(original["receipt.json"])) as DecisionReceipt;
  const missingEntries = [
    ["receipt.json", "manifest_receipt_missing"],
    [receipt.sources[0]!.snapshotPath!, "manifest_snapshot_missing"]
  ] as const;

  for (const [missingPath, expectedCode] of missingEntries) {
    const bundle = { ...original };
    const manifest = JSON.parse(String(bundle["integrity-manifest.json"])) as {
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    manifest.files = manifest.files.filter((entry) => entry.path !== missingPath);
    bundle["integrity-manifest.json"] = `${JSON.stringify(manifest)}\n`;

    const verification = await verifyReceiptBundle(bundle);
    assert.equal(verification.valid, false);
    assert.ok(verification.issues.some((issue) => issue.code === expectedCode), verification.errors.join("; "));
  }
});

test("receipt bundle verification rejects inherited and aliased file paths", async () => {
  const bundle = readBundle(path.join("packages", "decision-receipt", "examples", "minimal"));
  const manifest = JSON.parse(String(bundle["integrity-manifest.json"])) as {
    files: Array<{ path: string; sha256: string; bytes: number }>;
  };
  manifest.files.push({
    path: "toString",
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    bytes: 0
  });
  bundle["integrity-manifest.json"] = JSON.stringify(manifest);

  const verification = await verifyReceiptBundle(bundle);
  assert.equal(verification.valid, false);
  assert.ok(verification.issues.some((issue) => issue.code === "integrity_file_missing" && issue.message.includes("toString")));

  const aliasBundle = readBundle(path.join("packages", "decision-receipt", "examples", "minimal"));
  aliasBundle["./receipt.json"] = aliasBundle["receipt.json"]!;
  const aliased = await verifyReceiptBundle(aliasBundle);
  assert.equal(aliased.valid, false);
  assert.ok(aliased.issues.some((issue) => issue.code === "bundle_path_duplicate"));
});

test("receipt CLI preserves a bundle file named __proto__", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-prototype-path-"));
  try {
    const example = readBundle(path.join("packages", "decision-receipt", "examples", "minimal"));
    for (const [filePath, contents] of Object.entries(example)) {
      const destination = path.join(tempDir, filePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const data = typeof contents === "string" ? contents : new Uint8Array(contents);
      fs.writeFileSync(destination, data);
    }

    const prototypeFile = Buffer.from("valid evidence under a prototype-named path");
    fs.writeFileSync(path.join(tempDir, "__proto__"), prototypeFile);
    const manifestPath = path.join(tempDir, "integrity-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    manifest.files.push({
      path: "__proto__",
      sha256: createHash("sha256").update(prototypeFile).digest("hex"),
      bytes: prototypeFile.byteLength
    });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

    const cliPath = path.resolve("packages", "decision-receipt", "dist", "cli.js");
    const output = execFileSync(process.execPath, [cliPath, "verify", tempDir], { encoding: "utf8" });
    assert.match(output, /integrity verified/i);
    assert.match(output, /evidence is not proof|integrity is not proof/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
    contradictions: false,
    limitations: false,
    nextValidation: false,
    provenance: false,
    policy: true,
    model: true,
    prompt: true,
    decision: true
  });
  assert.deepEqual(comparison.changedSources, []);
  const markdown = renderDecisionReceiptComparison(comparison);
  assert.match(markdown, /Policy changed: yes/);
  assert.match(markdown, /Model changed: yes/);
  assert.match(markdown, /Prompt contract changed: yes/);
});

test("core diff reports run provenance changes without flagging a run ID alone", () => {
  const earlier = exampleReceipt("full");
  const sameRun = structuredClone(earlier);
  sameRun.provenance.runId = "different-run-id";
  assert.equal(compareDecisionReceipts(earlier, sameRun).changes.provenance, false);

  const later = structuredClone(earlier);
  later.provenance.kind = "imported";
  later.provenance.cliVersion = "0.5.2";
  later.provenance.workflowId = "external-import";
  later.provenance.fixture = false;
  const comparison = compareDecisionReceipts(earlier, later);
  assert.equal(comparison.changes.provenance, true);
  assert.deepEqual(comparison.provenanceChange, {
    earlier: {
      kind: earlier.provenance.kind,
      cliVersion: earlier.provenance.cliVersion,
      workflowId: earlier.provenance.workflowId,
      fixture: earlier.provenance.fixture
    },
    later: {
      kind: later.provenance.kind,
      cliVersion: later.provenance.cliVersion,
      workflowId: later.provenance.workflowId,
      fixture: later.provenance.fixture
    }
  });
  assert.match(comparison.changedBecause.join(" "), /run provenance changed/);
  assert.match(renderDecisionReceiptComparison(comparison), /Run provenance changed/);
});

test("core diff reports contradictions, limitations, and next validation changes", () => {
  const earlier = exampleReceipt("contradicted");
  const later = structuredClone(earlier);
  later.contradictions[0]!.note = "The contradictory evidence needs another review.";
  later.limitations = ["A newly discovered limitation."];
  later.nextValidation = "Recheck the cited source after its next update.";

  const comparison = compareDecisionReceipts(earlier, later);
  assert.equal(comparison.changes.contradictions, true);
  assert.equal(comparison.changes.limitations, true);
  assert.equal(comparison.changes.nextValidation, true);
  assert.deepEqual(comparison.changedContradictions.map((item) => item.id), ["contradiction-1"]);
  assert.deepEqual(comparison.addedLimitations, ["A newly discovered limitation."]);
  assert.deepEqual(comparison.removedLimitations, ["This fixture demonstrates the contract; it does not establish source truth."]);
  assert.deepEqual(comparison.nextValidationChange, {
    earlier: earlier.nextValidation,
    later: later.nextValidation
  });

  const markdown = renderDecisionReceiptComparison(comparison);
  assert.match(markdown, /Changed contradictions/);
  assert.match(markdown, /Limitations added/);
  assert.match(markdown, /Limitations removed/);
  assert.match(markdown, /Next validation changed/);
  assert.match(markdown, /A newly discovered limitation\./);
});

test("core diff ignores object-key and evidence-order changes", () => {
  const earlier = exampleReceipt("full");
  const later = structuredClone(earlier);
  const earlierClaim = earlier.claims[0]!;
  const extraEvidence = { ...earlierClaim.evidence[0]!, id: "evidence-2" };
  earlierClaim.evidence.push(extraEvidence);
  const laterClaim = later.claims[0]!;
  laterClaim.evidence.push(extraEvidence);
  later.claims[0] = {
    limitation: laterClaim.limitation,
    evidence: laterClaim.evidence.reverse(),
    text: laterClaim.text,
    id: laterClaim.id,
    status: laterClaim.status
  };
  earlier.limitations = ["Second limitation.", "First limitation."];
  later.limitations = ["First limitation.", "Second limitation."];

  const comparison = compareDecisionReceipts(earlier, later);
  assert.equal(comparison.changes.claims, false);
  assert.equal(comparison.changes.limitations, false);
  assert.deepEqual(comparison.changedClaims, []);
  assert.deepEqual(comparison.addedLimitations, []);
  assert.deepEqual(comparison.removedLimitations, []);
});

test("core diff explains changed evidence references", () => {
  const earlier = exampleReceipt("full");
  const later = structuredClone(earlier);
  later.claims[0]!.evidence[0]!.excerpt = "The exported evidence was replaced.";

  const comparison = compareDecisionReceipts(earlier, later);
  assert.deepEqual(comparison.changedClaims.map((item) => item.id), [earlier.claims[0]!.id]);
  const markdown = renderDecisionReceiptComparison(comparison);
  assert.match(markdown, /Evidence `evidence-1`/);
  assert.match(markdown, /The evidence remains inspectable after export/);
  assert.match(markdown, /The exported evidence was replaced/);
});

test("core Markdown keeps untrusted evidence markup inside code spans", () => {
  const earlier = exampleReceipt("full");
  const later = structuredClone(earlier);
  later.claims[0]!.evidence[0]!.excerpt = "Read `this` ![pixel](https://example.invalid/track)";

  const markdown = renderDecisionReceiptComparison(compareDecisionReceipts(earlier, later));
  assert.match(markdown, /``"Read `this` !\[pixel\]\(https:\/\/example\.invalid\/track\)"``/);
});

test("core diff reports changed source snapshots at an existing URL", () => {
  const earlier = exampleReceipt("full");
  const later = structuredClone(earlier);
  later.sources[0]!.snapshotSha256 = "b".repeat(64);
  later.sources[0]!.collectedAt = "2026-09-01T00:00:00.000Z";
  later.sources[0]!.title = "Updated `source` ![pixel](https://example.invalid/track)";

  const comparison = compareDecisionReceipts(earlier, later);
  assert.deepEqual(comparison.newSources, []);
  assert.deepEqual(comparison.disappearedSources, []);
  assert.equal(comparison.changes.sources, true);
  assert.equal(comparison.changedSources.length, 1);
  assert.equal(comparison.changedSources[0]?.url, earlier.sources[0]?.url);
  assert.match(comparison.changedBecause.join(" "), /existing source URL changed/);
  const markdown = renderDecisionReceiptComparison(comparison);
  assert.match(markdown, /Existing sources changed/);
  assert.match(markdown, /collectedAt/);
  assert.match(markdown, /snapshotSha256/);
  assert.match(markdown, /``\[\{"id":"source-1","value":"Updated `source` !\[pixel\]\(https:\/\/example\.invalid\/track\)"\}\]``/);
});

test("core diff detects a changed source snapshot path", () => {
  const earlier = exampleReceipt("full");
  const later = structuredClone(earlier);
  later.sources[0]!.snapshotPath = "evidence/updated-source.md";

  const comparison = compareDecisionReceipts(earlier, later);
  assert.equal(comparison.changes.sources, true);
  assert.equal(comparison.changedSources.length, 1);
  assert.match(renderDecisionReceiptComparison(comparison), /snapshotPath/);
});

test("core source diff order does not depend on receipt source order", () => {
  const earlier = exampleReceipt("full");
  const later = structuredClone(earlier);
  const template = earlier.sources[0]!;
  for (const id of ["removed-z", "removed-a", "changed-z", "changed-a"]) {
    earlier.sources.push({ ...template, id, url: `https://${id}.example/source` });
  }
  for (const id of ["added-z", "added-a", "changed-z", "changed-a"]) {
    later.sources.push({
      ...template,
      id,
      url: `https://${id}.example/source`,
      ...(id.startsWith("changed-") ? { title: `Updated ${id}` } : {})
    });
  }

  const comparison = compareDecisionReceipts(earlier, later);
  const reorderedEarlier = structuredClone(earlier);
  const reorderedLater = structuredClone(later);
  reorderedEarlier.sources.reverse();
  reorderedLater.sources.reverse();
  const reorderedComparison = compareDecisionReceipts(reorderedEarlier, reorderedLater);

  assert.deepEqual(reorderedComparison, comparison);
  assert.deepEqual(comparison.newSources.map((source) => source.id), ["added-a", "added-z"]);
  assert.deepEqual(comparison.disappearedSources.map((source) => source.id), ["removed-a", "removed-z"]);
  assert.deepEqual(comparison.changedSources.map((source) => source.url), [
    "https://changed-a.example/source",
    "https://changed-z.example/source"
  ]);
});

test("a clean TypeScript project installs only the core tarball and renders a diff", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-consumer-"));
  try {
    const packJson = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", tempDir], {
      cwd: path.resolve("packages", "decision-receipt"),
      encoding: "utf8"
    })) as Array<{ filename: string; unpackedSize: number }> | Record<string, { filename: string; unpackedSize: number }>;
    const pack = Array.isArray(packJson) ? packJson[0] : Object.values(packJson)[0];
    assert.ok(pack, "npm pack must describe the generated core tarball");
    assert.ok(pack.unpackedSize <= 180_000, `core unpacked size ${pack.unpackedSize} exceeds 180 KB`);
    const tarball = path.join(tempDir, pack.filename);
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
      "--strict", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16", "--lib", "ES2022,DOM", "consumer.ts"
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
