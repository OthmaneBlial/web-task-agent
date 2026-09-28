import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { listDemoFixtures, writeDemoPackage } from "../demos";
import {
  compareDecisionReceipts,
  renderDecisionReceiptComparison,
  signReceiptDirectory,
  writeReceiptIntegrityManifest,
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

test("manifest writer refuses missing package artifacts without replacing a valid manifest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-manifest-write-"));
  try {
    const written = writeDemoPackage({ id: "local-first-risk-review", outputDir: root });
    const manifestPath = path.join(root, "integrity-manifest.json");
    const originalManifest = fs.readFileSync(manifestPath);
    const manifest = JSON.parse(originalManifest.toString("utf8")) as {
      generatedAt: string;
      files: Array<{ path: string }>;
    };
    const files = manifest.files.map((entry) => path.join(root, entry.path));

    assert.throws(
      () => writeReceiptIntegrityManifest({
        rootDir: root,
        files,
        generatedAt: "2025-02-30T00:00:00Z"
      }),
      /integrity manifest generatedAt must be a valid timestamp/
    );
    assert.deepEqual(fs.readFileSync(manifestPath), originalManifest);
    assert.throws(
      () => writeReceiptIntegrityManifest({
        rootDir: root,
        files: [...files, path.join(root, "handoff", "missing.md")],
        generatedAt: manifest.generatedAt
      }),
      /receipt artifact is missing, unsafe, or exceeds receipt verification limits/
    );
    assert.deepEqual(fs.readFileSync(manifestPath), originalManifest);
    const oversizedFile = path.join(root, "oversized.bin");
    fs.closeSync(fs.openSync(oversizedFile, "w"));
    fs.truncateSync(oversizedFile, 10 * 1024 * 1024 + 1);
    assert.throws(
      () => writeReceiptIntegrityManifest({
        rootDir: root,
        files: [...files, oversizedFile],
        generatedAt: manifest.generatedAt
      }),
      /receipt verification limits/
    );
    assert.deepEqual(fs.readFileSync(manifestPath), originalManifest);
    assert.equal(verifyReceiptDirectory(written.outputDir).valid, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("manifest writer sorts paths independently of the machine locale", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-manifest-order-"));
  try {
    writeDemoPackage({ id: "local-first-risk-review", outputDir: root });
    const manifestPath = path.join(root, "integrity-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      generatedAt: string;
      files: Array<{ path: string }>;
    };
    const extraPaths = ["evidence/A.md", "evidence/a.md", "evidence/z.md", "evidence/ä.md"];
    for (const relativePath of extraPaths) {
      fs.writeFileSync(path.join(root, relativePath), relativePath, "utf8");
    }

    writeReceiptIntegrityManifest({
      rootDir: root,
      files: [
        ...manifest.files.map((entry) => path.join(root, entry.path)),
        ...extraPaths.map((relativePath) => path.join(root, relativePath))
      ],
      generatedAt: manifest.generatedAt
    });

    const updated = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      files: Array<{ path: string }>;
    };
    assert.deepEqual(updated.files.map((entry) => entry.path).filter((filePath) => extraPaths.includes(filePath)), [
      "evidence/A.md",
      "evidence/a.md",
      "evidence/z.md",
      "evidence/ä.md"
    ]);
    assert.equal(verifyReceiptDirectory(root).valid, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("receipt signing refuses incomplete packages before replacing receipt bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-sign-incomplete-"));
  try {
    const written = writeDemoPackage({ id: "local-first-risk-review", outputDir: root });
    const receiptJsonPath = path.join(root, "receipt.json");
    const originalReceipt = fs.readFileSync(receiptJsonPath);
    fs.rmSync(written.reportPath);
    const keyPair = generateKeyPairSync("ed25519");

    assert.throws(
      () => signReceiptDirectory({ directory: root, privateKey: keyPair.privateKey, keyId: "test-key" }),
      /receipt artifact is missing, unsafe, or exceeds receipt verification limits/
    );
    assert.deepEqual(fs.readFileSync(receiptJsonPath), originalReceipt);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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

    receipt.sources[0]!.url = "https://user:password@example.com";
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const credentialBearing = verifyReceiptDirectory(tempDir);
    assert.equal(credentialBearing.valid, false);
    assert.ok(credentialBearing.errors.some((error) => error.includes("credential-bearing URL")));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("receipt verification refuses symlinked package files", { skip: process.platform === "win32" }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-symlink-"));
  try {
    for (const [index, file] of (["receipt.json", "integrity-manifest.json", "snapshot"] as const).entries()) {
      const bundle = path.join(root, `bundle-${index}`);
      writeDemoPackage({ id: "local-first-risk-review", outputDir: bundle });
      const receipt = JSON.parse(fs.readFileSync(path.join(bundle, "receipt.json"), "utf8")) as {
        sources: Array<{ snapshotPath: string | null }>;
      };
      const relativePath = file === "snapshot" ? receipt.sources[0]!.snapshotPath! : file;
      const packageFile = path.join(bundle, relativePath);
      const outsideFile = path.join(root, `outside-${index}.dat`);
      fs.copyFileSync(packageFile, outsideFile);
      fs.unlinkSync(packageFile);
      fs.symlinkSync(outsideFile, packageFile, "file");

      const result = verifyReceiptDirectory(bundle);
      assert.equal(result.valid, false, `${file} symlink unexpectedly verified`);
      assert.ok(result.errors.some((error) => error.includes("symlinked")), result.errors.join("; "));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("receipt directory verification requires manifest coverage for the receipt and snapshots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-manifest-coverage-"));
  try {
    for (const [index, omitted] of (["receipt.json", "snapshot"] as const).entries()) {
      const bundle = path.join(root, `bundle-${index}`);
      writeDemoPackage({ id: "local-first-risk-review", outputDir: bundle });
      const receipt = JSON.parse(fs.readFileSync(path.join(bundle, "receipt.json"), "utf8")) as {
        sources: Array<{ snapshotPath: string | null }>;
      };
      const missingPath = omitted === "snapshot" ? receipt.sources[0]!.snapshotPath! : omitted;
      const manifestPath = path.join(bundle, "integrity-manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        files: Array<{ path: string; sha256: string; bytes: number }>;
      };
      manifest.files = manifest.files.filter((entry) => entry.path !== missingPath);
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const result = verifyReceiptDirectory(bundle);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.includes(`does not cover ${omitted === "snapshot" ? "source snapshot" : "receipt.json"}`)), result.errors.join("; "));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("receipt directory verification rejects malformed manifest metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-manifest-shape-"));
  const invalidValues = {
    algorithm: "md5",
    receiptPath: "other.json",
    generatedAt: "2025-02-30T00:00:00Z"
  };
  try {
    for (const [index, key] of Object.keys(invalidValues).entries()) {
      const bundle = path.join(root, `bundle-${index}`);
      writeDemoPackage({ id: "local-first-risk-review", outputDir: bundle });
      const manifestPath = path.join(bundle, "integrity-manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      manifest[key] = invalidValues[key as keyof typeof invalidValues];
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const result = verifyReceiptDirectory(bundle);
      assert.equal(result.valid, false, `manifest with invalid ${key} unexpectedly verified`);
      assert.ok(result.errors.some((error) => error.includes("integrity manifest has an unsupported shape")), result.errors.join("; "));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("receipt directory verification rejects duplicate manifest paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-manifest-duplicate-"));
  try {
    const bundle = path.join(root, "bundle");
    writeDemoPackage({ id: "local-first-risk-review", outputDir: bundle });
    const manifestPath = path.join(bundle, "integrity-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    manifest.files.push({ ...manifest.files[0]! });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const result = verifyReceiptDirectory(bundle);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("integrity manifest path is duplicated")), result.errors.join("; "));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("receipt verification bounds file count, file size, and total bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-receipt-limits-"));
  try {
    const oversizedDir = path.join(root, "oversized-file");
    writeDemoPackage({ id: "local-first-risk-review", outputDir: oversizedDir });
    const oversizedReceipt = JSON.parse(fs.readFileSync(path.join(oversizedDir, "receipt.json"), "utf8")) as {
      sources: Array<{ snapshotPath: string }>;
    };
    fs.truncateSync(path.join(oversizedDir, oversizedReceipt.sources[0]!.snapshotPath), 10 * 1024 * 1024 + 1);
    assert.match(verifyReceiptDirectory(oversizedDir).errors.join("; "), /exceeds verification limits/);

    const oversizedManifestDir = path.join(root, "oversized-manifest");
    writeDemoPackage({ id: "local-first-risk-review", outputDir: oversizedManifestDir });
    const oversizedManifestPath = path.join(oversizedManifestDir, "integrity-manifest.json");
    const oversizedManifest = JSON.parse(fs.readFileSync(oversizedManifestPath, "utf8")) as {
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    oversizedManifest.files = Array.from({ length: 501 }, () => oversizedManifest.files[0]!);
    fs.writeFileSync(oversizedManifestPath, `${JSON.stringify(oversizedManifest)}\n`);
    assert.match(verifyReceiptDirectory(oversizedManifestDir).errors.join("; "), /499-file verification limit/);

    const oversizedTotalDir = path.join(root, "oversized-total");
    writeDemoPackage({ id: "local-first-risk-review", outputDir: oversizedTotalDir });
    const totalManifestPath = path.join(oversizedTotalDir, "integrity-manifest.json");
    const totalManifest = JSON.parse(fs.readFileSync(totalManifestPath, "utf8")) as {
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    const fileBytes = 10 * 1024 * 1024;
    const zeroHash = createHash("sha256");
    const zeroBlock = Buffer.alloc(1024 * 1024);
    for (let index = 0; index < 10; index += 1) zeroHash.update(zeroBlock);
    const sha256 = zeroHash.digest("hex");
    for (let index = 0; index < 5; index += 1) {
      const relativePath = `extra/${index}.bin`;
      const filePath = path.join(oversizedTotalDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.closeSync(fs.openSync(filePath, "w"));
      fs.truncateSync(filePath, fileBytes);
      totalManifest.files.push({ path: relativePath, sha256, bytes: fileBytes });
    }
    fs.writeFileSync(totalManifestPath, `${JSON.stringify(totalManifest)}\n`);
    assert.match(verifyReceiptDirectory(oversizedTotalDir).errors.join("; "), /exceeds verification limits/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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
    assert.match(renderDecisionReceiptComparison(comparison), /Changes detected/);

    const renamed = structuredClone(earlier.receipt!);
    renamed.decision.title = `${renamed.decision.title} (revised)`;
    const titleOnly = compareDecisionReceipts(earlier.receipt!, renamed);
    assert.equal(titleOnly.decisionChanged, true);
    assert.equal(titleOnly.changes.decision, true);
    assert.deepEqual(titleOnly.changedBecause, ["the decision title or summary changed"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
