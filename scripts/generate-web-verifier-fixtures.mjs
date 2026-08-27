import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "docs", "assets", "web-verifier-fixtures.js");

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readBundle(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const files = {};
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files[path.relative(directory, absolute).split(path.sep).join("/")] = fs.readFileSync(absolute, "utf8");
    }
  };
  visit(directory);
  return files;
}

function changedBundle() {
  const files = readBundle("examples/receipt-spec/minimal");
  const receipt = JSON.parse(files["receipt.json"]);
  const snapshot = "# Independent validation\n\nThe second review found contrary evidence and changed the recommendation.\n";
  receipt.generatedAt = "2026-08-28T00:00:00.000Z";
  receipt.provenance.policyVersion = "source-policy-v2";
  receipt.provenance.promptVersion = "synthesis-v2";
  receipt.provenance.model = "example/model-v2";
  receipt.decision.summary = "Pause the decision because independent validation found contrary evidence.";
  receipt.claims[0].text = "Independent validation supports the original decision.";
  receipt.claims[0].status = "contradicted";
  receipt.claims[0].evidence[0].excerpt = "The second review found contrary evidence and changed the recommendation.";
  receipt.claims[0].evidence[0].relation = "contradicts";
  receipt.sources[0].title = "Independent validation";
  receipt.sources[0].url = "https://example.org/independent-validation";
  receipt.sources[0].publisher = "Independent Example";
  receipt.sources[0].collectedAt = "2026-08-28T00:00:00.000Z";
  receipt.sources[0].snapshotSha256 = hash(snapshot);
  receipt.contradictions = [{
    id: "contradiction-1",
    topic: "original recommendation",
    evidenceIds: ["evidence-1"],
    note: "The independent review contradicts the earlier support."
  }];
  receipt.nextValidation = "Resolve the contrary evidence with a named reviewer before resuming the decision.";
  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  const manifestFiles = { "receipt.json": receiptJson, "evidence/source.md": snapshot };
  const manifest = {
    schemaVersion: 1,
    specVersion: "1.0.0",
    type: "receipt-integrity-manifest",
    algorithm: "sha256",
    receiptPath: "receipt.json",
    generatedAt: receipt.generatedAt,
    files: Object.entries(manifestFiles).map(([filePath, content]) => ({
      path: filePath,
      sha256: hash(content),
      bytes: Buffer.byteLength(content)
    }))
  };
  return { ...manifestFiles, "integrity-manifest.json": `${JSON.stringify(manifest, null, 2)}\n` };
}

const fixtures = {
  valid: {
    label: "Valid receipt",
    description: "A structurally valid bundle whose receipt and source bytes match the manifest.",
    files: readBundle("examples/receipt-spec/minimal")
  },
  tampered: {
    label: "Tampered receipt",
    description: "The snapshot changed after the manifest was written; verification must name that file.",
    files: readBundle("examples/receipt-spec/tampered")
  },
  changed: {
    label: "Changed decision",
    description: "A valid second receipt with new evidence, policy, model, synthesis, and decision changes.",
    files: changedBundle()
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `/* Generated safe fixtures; loaded with the page so they keep working offline. */\nglobalThis.WEB_VERIFIER_FIXTURES = Object.freeze(${JSON.stringify(fixtures)});\n`,
  "utf8"
);
console.log("Generated three embedded web verifier fixtures.");
