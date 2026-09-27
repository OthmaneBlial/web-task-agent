import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, "schema", "decision-receipt.v1.schema.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(root, "examples", "receipt-spec", "minimal", "receipt.json"), "utf8"));
const core = await import(path.join(root, "packages", "decision-receipt", "dist", "index.js"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const clone = (value) => structuredClone(value);
const cases = [
  { id: "schema-valid-minimal", receipt: clone(baseline), expected: true },
  { id: "schema-valid-date-only-source", receipt: (() => { const value = clone(baseline); value.sources[0].collectedAt = "2026-08-27"; return value; })(), expected: true },
  { id: "schema-valid-lowercase-date-time", receipt: (() => { const value = clone(baseline); value.generatedAt = "2026-08-27t00:00:00.000z"; return value; })(), expected: true },
  { id: "schema-valid-leap-second", receipt: (() => { const value = clone(baseline); value.generatedAt = "2016-12-31T23:59:60Z"; return value; })(), expected: true },
  { id: "schema-additive-field", receipt: { ...clone(baseline), producerExtension: { reviewId: "example" } }, expected: true },
  { id: "schema-invalid-date-only-generated-at", receipt: (() => { const value = clone(baseline); value.generatedAt = "2026-08-27"; return value; })(), expected: false },
  { id: "schema-invalid-whitespace-title", receipt: (() => { const value = clone(baseline); value.decision.title = " \t\n"; return value; })(), expected: false },
  { id: "schema-invalid-whitespace-source-path", receipt: (() => { const value = clone(baseline); value.sources[0].snapshotPath = " \t\n"; return value; })(), expected: false },
  { id: "schema-invalid-human-date", receipt: (() => { const value = clone(baseline); value.generatedAt = "January 1, 2025"; return value; })(), expected: false },
  { id: "schema-invalid-impossible-generated-at", receipt: (() => { const value = clone(baseline); value.generatedAt = "2025-02-30T00:00:00Z"; return value; })(), expected: false },
  { id: "schema-invalid-impossible-collected-at", receipt: (() => { const value = clone(baseline); value.sources[0].collectedAt = "2025-02-30"; return value; })(), expected: false },
  { id: "schema-invalid-timezone", receipt: (() => { const value = clone(baseline); value.generatedAt = "2025-01-01T00:00:00+24:00"; return value; })(), expected: false },
  { id: "schema-invalid-shape", receipt: (() => { const value = clone(baseline); delete value.decision; return value; })(), expected: false },
  { id: "schema-unsafe-path", receipt: (() => { const value = clone(baseline); value.sources[0].snapshotPath = "../private.md"; return value; })(), expected: false },
  { id: "schema-dot-path", receipt: (() => { const value = clone(baseline); value.sources[0].snapshotPath = "evidence/./source.md"; return value; })(), expected: false },
  { id: "schema-invalid-trailing-slash-path", receipt: (() => { const value = clone(baseline); value.sources[0].snapshotPath = "evidence/"; return value; })(), expected: false },
  { id: "schema-credential-url", receipt: (() => { const value = clone(baseline); value.sources[0].url = "https://user:password@example.com"; return value; })(), expected: false },
  { id: "schema-incomplete-snapshot-pair", receipt: (() => { const value = clone(baseline); value.sources[0].snapshotSha256 = null; return value; })(), expected: false },
  { id: "schema-contradiction-relation-required", receipt: (() => { const value = clone(baseline); value.claims[0].status = "contradicted"; return value; })(), expected: false },
  { id: "schema-insufficient-limitation-required", receipt: (() => { const value = clone(baseline); value.claims[0].status = "insufficient"; return value; })(), expected: false },
  { id: "schema-unknown-major", receipt: { ...clone(baseline), specVersion: "9.0.0" }, expected: false }
];

let failures = 0;
for (const testCase of cases) {
  const actual = validate(testCase.receipt);
  const runtime = core.validateDecisionReceipt(testCase.receipt).valid;
  if (actual !== testCase.expected || runtime !== testCase.expected) {
    failures += 1;
    console.error(`${testCase.id}: expected ${testCase.expected}, schema=${actual}, runtime=${runtime}: ${ajv.errorsText(validate.errors)}`);
  } else {
    console.log(`${testCase.id}: passed`);
  }
}

if (failures > 0) process.exitCode = 1;
else console.log(`Independent JSON Schema conformance passed: ${cases.length} case(s).`);
