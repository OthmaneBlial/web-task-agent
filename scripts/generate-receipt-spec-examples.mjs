import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const core = await import(path.join(root, "packages", "decision-receipt", "dist", "index.js"));
const generatedAt = "2026-08-27T00:00:00.000Z";
const snapshot = "# Example source\n\nThe evidence remains inspectable after export.\n";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function receiptFor(kind) {
  const contradicted = kind === "contradicted";
  const incomplete = kind === "incomplete";
  const full = kind === "full";
  const evidence = {
    id: "evidence-1",
    sourceId: "source-1",
    excerpt: "The evidence remains inspectable after export.",
    relation: contradicted ? "contradicts" : incomplete ? "context" : "supports"
  };
  return {
    schemaVersion: 1,
    specVersion: "1.0.0",
    profile: full ? "full" : "minimal",
    type: "decision-receipt",
    generatedAt,
    provenance: {
      kind: "captured",
      runId: full ? "example-run" : null,
      cliVersion: full ? "0.5.1" : null,
      workflowId: full ? "example-workflow" : null,
      policyVersion: full ? "source-policy-v1" : null,
      promptVersion: full ? "synthesis-v1" : null,
      model: full ? "provider/model-declared-by-producer" : null,
      fixture: true
    },
    decision: {
      title: `${kind[0].toUpperCase()}${kind.slice(1)} receipt example`,
      summary: contradicted
        ? "Do not rely on the decision until contrary evidence is resolved."
        : incomplete
          ? "The decision remains open because the evidence is incomplete."
          : "Keep the decision only while the exported evidence remains inspectable."
    },
    claims: [{
      id: "claim-1",
      text: "The receipt contains enough evidence for review.",
      status: contradicted ? "contradicted" : incomplete ? "insufficient" : "supported",
      evidence: [evidence],
      ...(incomplete ? { limitation: "Only contextual evidence is available; direct support is missing." } : {})
    }],
    sources: [{
      id: "source-1",
      title: "Example source",
      url: "https://example.com/decision-receipt",
      publisher: "Example",
      role: "safe protocol fixture",
      collectedAt: kind === "stale" ? "2024-01-15T00:00:00.000Z" : generatedAt,
      captureType: "fixture-synthetic",
      snapshotPath: "evidence/source.md",
      snapshotSha256: hash(snapshot)
    }],
    contradictions: contradicted ? [{
      id: "contradiction-1",
      topic: "evidence sufficiency",
      evidenceIds: ["evidence-1"],
      note: "The attached evidence contradicts the claim."
    }] : [],
    nextValidation: incomplete
      ? "Collect one direct source and attach a verbatim excerpt."
      : "Change one evidence byte and confirm integrity verification fails.",
    limitations: [
      kind === "stale" ? "The only source is stale and must be recollected before use." : "This fixture demonstrates the contract; it does not establish source truth."
    ],
    integrity: {
      algorithm: "sha256",
      manifestPath: "integrity-manifest.json",
      note: "Integrity proves bytes, not truth."
    }
  };
}

function signReceipt(receipt) {
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const seed = Buffer.from("decision-receipt-public-example-key", "utf8").subarray(0, 32);
  const privateKey = createPrivateKey({ key: Buffer.concat([prefix, seed]), format: "der", type: "pkcs8" });
  const signatureBase64 = sign(null, Buffer.from(core.canonicalizeReceiptForSigning(receipt)), privateKey).toString("base64");
  return {
    ...receipt,
    signature: {
      algorithm: "ed25519",
      keyId: "public-example-key-do-not-use",
      publicKeyPem: createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString(),
      signatureBase64,
      signedBytes: "canonical-receipt-without-signature"
    }
  };
}

function manifest(files) {
  return {
    schemaVersion: 1,
    specVersion: "1.0.0",
    type: "receipt-integrity-manifest",
    algorithm: "sha256",
    receiptPath: "receipt.json",
    generatedAt,
    files: Object.entries(files).map(([filePath, content]) => ({
      path: filePath,
      sha256: hash(content),
      bytes: Buffer.byteLength(content)
    }))
  };
}

function writeBundle(baseDir, kind) {
  let receipt = receiptFor(kind);
  if (kind === "signed") receipt = signReceipt(receipt);
  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  const originalFiles = { "receipt.json": receiptJson, "evidence/source.md": snapshot };
  const files = {
    ...originalFiles,
    "integrity-manifest.json": `${JSON.stringify(manifest(originalFiles), null, 2)}\n`
  };
  if (kind === "tampered") files["evidence/source.md"] = `${snapshot}Tampered after the manifest was created.\n`;
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(baseDir, kind, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
}

const kinds = ["minimal", "full", "contradicted", "incomplete", "stale", "signed", "tampered"];
for (const baseDir of [
  path.join(root, "examples", "receipt-spec"),
  path.join(root, "packages", "decision-receipt", "examples")
]) {
  for (const kind of kinds) writeBundle(baseDir, kind);
}

console.log(`Generated ${kinds.length} Decision Receipt example bundle(s) in root and core package.`);
