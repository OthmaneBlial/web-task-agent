import fs from "node:fs";
import path from "node:path";

import { verifyReceiptDirectory } from "../dist/lib/receipt.js";

const root = process.cwd();
const receiptsRoot = path.join(root, "examples", "receipts");
const evaluationRoot = path.join(root, "evaluation");
const receiptDirectories = fs.readdirSync(receiptsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (receiptDirectories.length < 8 || receiptDirectories.length > 12) {
  throw new Error(`expected 8-12 receipt fixtures, found ${receiptDirectories.length}`);
}

const cases = receiptDirectories.map((id) => {
  const directory = path.join(receiptsRoot, id);
  const verification = verifyReceiptDirectory(directory);
  const receipt = verification.receipt;
  const claims = receipt?.claims ?? [];
  const sources = receipt?.sources ?? [];
  const claimsWithEvidence = claims.filter((claim) => claim.evidence.length > 0).length;
  const sourcesWithSnapshots = sources.filter((source) => source.snapshotPath && source.snapshotSha256).length;
  const structuralChecks = {
    receiptValid: verification.valid,
    claimsLinked: claims.length === 0 || claimsWithEvidence === claims.length,
    sourcesSnapshotted: sources.length === 0 || sourcesWithSnapshots === sources.length,
    hasLimitations: Boolean(receipt?.limitations.length),
    hasNextValidation: Boolean(receipt?.nextValidation.trim()),
    fixtureLabeled: receipt?.provenance.fixture === true
  };
  return {
    id,
    valid: Object.values(structuralChecks).every(Boolean),
    checkedFiles: verification.checkedFiles,
    claims: claims.length,
    claimsWithEvidence,
    sources: sources.length,
    sourcesWithSnapshots,
    structuralChecks,
    errors: verification.errors
  };
});

const totals = cases.reduce((accumulator, item) => ({
  claims: accumulator.claims + item.claims,
  claimsWithEvidence: accumulator.claimsWithEvidence + item.claimsWithEvidence,
  sources: accumulator.sources + item.sources,
  sourcesWithSnapshots: accumulator.sourcesWithSnapshots + item.sourcesWithSnapshots,
  checkedFiles: accumulator.checkedFiles + item.checkedFiles
}), { claims: 0, claimsWithEvidence: 0, sources: 0, sourcesWithSnapshots: 0, checkedFiles: 0 });

const scorecard = {
  schemaVersion: 1,
  type: "decision-receipt-evaluation",
  corpus: {
    kind: "deterministic-fixtures",
    path: "examples/receipts",
    cases: cases.length,
    adversarialCases: fs.readdirSync(path.join(evaluationRoot, "adversarial"), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length
  },
  totals,
  rates: {
    validReceipts: cases.filter((item) => item.valid).length / cases.length,
    claimEvidenceCoverage: totals.claims === 0 ? 1 : totals.claimsWithEvidence / totals.claims,
    sourceSnapshotCoverage: totals.sources === 0 ? 1 : totals.sourcesWithSnapshots / totals.sources
  },
  gates: {
    corpusSize: cases.length >= 8 && cases.length <= 12,
    everyReceiptValid: cases.every((item) => item.valid),
    everyClaimLinked: cases.every((item) => item.structuralChecks.claimsLinked),
    everySourceSnapshotted: cases.every((item) => item.structuralChecks.sourcesSnapshotted)
  },
  cases,
  limitations: [
    "Fixtures are synthetic and do not measure model quality, web recall, freshness, or factual truth.",
    "A structural pass proves package consistency only; reviewers must re-open sources for consequential decisions.",
    "Adversarial cases are policy regressions, not a complete security assessment."
  ]
};

const scorecardJson = `${JSON.stringify(scorecard, null, 2)}\n`;
const gateLabel = scorecard.gates.everyReceiptValid && scorecard.gates.everyClaimLinked && scorecard.gates.everySourceSnapshotted ? "PASS" : "FAIL";
const markdown = [
  "# Receipt evaluation scorecard",
  "",
  `**Gate: ${gateLabel}** — ${cases.length} deterministic receipts, ${scorecard.corpus.adversarialCases} adversarial policy cases, ${totals.checkedFiles} files checked.`,
  "",
  "This is a structural regression scorecard, not a benchmark of model intelligence or web truth.",
  "",
  "## Rates",
  "",
  `- Valid receipt packages: ${(scorecard.rates.validReceipts * 100).toFixed(1)}% (${cases.filter((item) => item.valid).length}/${cases.length})`,
  `- Claims with at least one evidence reference: ${(scorecard.rates.claimEvidenceCoverage * 100).toFixed(1)}% (${totals.claimsWithEvidence}/${totals.claims})`,
  `- Sources with a snapshot and hash: ${(scorecard.rates.sourceSnapshotCoverage * 100).toFixed(1)}% (${totals.sourcesWithSnapshots}/${totals.sources})`,
  "",
  "## Cases",
  "",
  "| Receipt | Claims | Sources | Files | Status |",
  "| --- | ---: | ---: | ---: | --- |",
  ...cases.map((item) => `| ${item.id} | ${item.claimsWithEvidence}/${item.claims} | ${item.sourcesWithSnapshots}/${item.sources} | ${item.checkedFiles} | ${item.valid ? "pass" : "fail"} |`),
  "",
  "## Limits",
  "",
  ...scorecard.limitations.map((item) => `- ${item}`),
  ""
].join("\n");

fs.mkdirSync(evaluationRoot, { recursive: true });
fs.writeFileSync(path.join(evaluationRoot, "scorecard.json"), scorecardJson, "utf8");
fs.writeFileSync(path.join(evaluationRoot, "scorecard.md"), markdown, "utf8");

if (!scorecard.gates.everyReceiptValid || !scorecard.gates.everyClaimLinked || !scorecard.gates.everySourceSnapshotted) {
  throw new Error("receipt evaluation gate failed; inspect evaluation/scorecard.json");
}

console.log(`Receipt evaluation passed: ${cases.length} fixtures, ${totals.checkedFiles} files, ${totals.claims} claims, ${totals.sources} sources.`);
