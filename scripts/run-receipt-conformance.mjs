import { createHash, generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const core = await import(path.join(root, "packages", "decision-receipt", "dist", "index.js"));
const recipes = JSON.parse(fs.readFileSync(path.join(root, "conformance", "cases.json"), "utf8"));
const encoder = new TextEncoder();

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function baseReceipt(snapshotHash) {
  return {
    schemaVersion: 1,
    specVersion: "1.0.0",
    profile: "minimal",
    type: "decision-receipt",
    generatedAt: "2026-08-27T00:00:00.000Z",
    provenance: {
      kind: "captured",
      runId: null,
      cliVersion: null,
      workflowId: null,
      policyVersion: "conformance-v1",
      promptVersion: null,
      model: null,
      fixture: true
    },
    decision: {
      title: "Conformance decision",
      summary: "Keep the contract only if its evidence remains inspectable."
    },
    claims: [{
      id: "claim-1",
      text: "The receipt contains inspectable evidence.",
      status: "supported",
      evidence: [{
        id: "evidence-1",
        sourceId: "source-1",
        excerpt: "Inspectable evidence excerpt.",
        relation: "supports"
      }]
    }],
    sources: [{
      id: "source-1",
      title: "Conformance source",
      url: "https://example.com/conformance",
      publisher: "Example",
      role: "conformance fixture",
      collectedAt: "2026-08-27T00:00:00.000Z",
      captureType: "fixture-synthetic",
      snapshotPath: "evidence/source.md",
      snapshotSha256: snapshotHash
    }],
    contradictions: [],
    nextValidation: "Tamper with one byte and confirm verification fails.",
    limitations: ["This fixture tests the contract, not the truth of a source."],
    integrity: {
      algorithm: "sha256",
      manifestPath: "integrity-manifest.json",
      note: "Integrity proves bytes, not truth."
    }
  };
}

function addSignature(receipt, mismatch) {
  const keys = generateKeyPairSync("ed25519");
  const signature = sign(null, encoder.encode(core.canonicalizeReceiptForSigning(receipt)), keys.privateKey).toString("base64");
  receipt.signature = {
    algorithm: "ed25519",
    keyId: "conformance-key",
    publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    signatureBase64: mismatch ? `${signature.slice(0, -2)}AA` : signature,
    signedBytes: "canonical-receipt-without-signature"
  };
}

function makeManifest(files) {
  return {
    schemaVersion: 1,
    specVersion: "1.0.0",
    type: "receipt-integrity-manifest",
    algorithm: "sha256",
    receiptPath: "receipt.json",
    generatedAt: "2026-08-27T00:00:00.000Z",
    files: Object.entries(files).map(([filePath, content]) => ({
      path: filePath,
      sha256: hash(content),
      bytes: Buffer.byteLength(content)
    }))
  };
}

async function bundleFor(mutation) {
  const snapshot = "# Conformance source\n\nInspectable evidence excerpt.\n";
  const receipt = baseReceipt(hash(snapshot));
  if (mutation === "remove-decision") delete receipt.decision;
  if (mutation === "duplicate-source") receipt.sources.push({ ...receipt.sources[0] });
  if (mutation === "unsafe-snapshot-path") receipt.sources[0].snapshotPath = "../private.md";
  if (mutation === "unknown-spec-version") receipt.specVersion = "9.0.0";
  if (mutation === "signature-mismatch") addSignature(receipt, true);

  const files = {
    "receipt.json": `${JSON.stringify(receipt, null, 2)}\n`,
    "evidence/source.md": snapshot
  };
  const bundle = {
    ...files,
    "integrity-manifest.json": `${JSON.stringify(makeManifest(files), null, 2)}\n`
  };
  if (mutation === "tamper-after-manifest") bundle["evidence/source.md"] += "Tampered.\n";
  return bundle;
}

const result = await core.runDecisionReceiptConformance(
  recipes.cases,
  (recipe) => bundleFor(recipe.mutation)
);
for (const testCase of result.cases) {
  if (!testCase.passed) {
    console.error(`${testCase.id}: expected valid=${testCase.expectedValid} code=${testCase.expectedCode || "none"}; received valid=${testCase.actualValid} codes=${testCase.issueCodes.join(",")}`);
  } else {
    console.log(`${testCase.id}: passed`);
  }
}

if (!result.passed) process.exitCode = 1;
else console.log(`Decision Receipt conformance passed: ${recipes.cases.length} case(s).`);
