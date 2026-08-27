import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, "schema", "decision-receipt.v1.schema.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(root, "examples", "receipt-spec", "minimal", "receipt.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const clone = (value) => structuredClone(value);
const cases = [
  { id: "schema-valid-minimal", receipt: clone(baseline), expected: true },
  { id: "schema-additive-field", receipt: { ...clone(baseline), producerExtension: { reviewId: "example" } }, expected: true },
  { id: "schema-invalid-shape", receipt: (() => { const value = clone(baseline); delete value.decision; return value; })(), expected: false },
  { id: "schema-unsafe-path", receipt: (() => { const value = clone(baseline); value.sources[0].snapshotPath = "../private.md"; return value; })(), expected: false },
  { id: "schema-dot-path", receipt: (() => { const value = clone(baseline); value.sources[0].snapshotPath = "evidence/./source.md"; return value; })(), expected: false },
  { id: "schema-credential-url", receipt: (() => { const value = clone(baseline); value.sources[0].url = "https://user:password@example.com"; return value; })(), expected: false },
  { id: "schema-incomplete-snapshot-pair", receipt: (() => { const value = clone(baseline); value.sources[0].snapshotSha256 = null; return value; })(), expected: false },
  { id: "schema-contradiction-relation-required", receipt: (() => { const value = clone(baseline); value.claims[0].status = "contradicted"; return value; })(), expected: false },
  { id: "schema-insufficient-limitation-required", receipt: (() => { const value = clone(baseline); value.claims[0].status = "insufficient"; return value; })(), expected: false },
  { id: "schema-unknown-major", receipt: { ...clone(baseline), specVersion: "9.0.0" }, expected: false }
];

let failures = 0;
for (const testCase of cases) {
  const actual = validate(testCase.receipt);
  if (actual !== testCase.expected) {
    failures += 1;
    console.error(`${testCase.id}: expected ${testCase.expected}, received ${actual}: ${ajv.errorsText(validate.errors)}`);
  } else {
    console.log(`${testCase.id}: passed`);
  }
}

if (failures > 0) process.exitCode = 1;
else console.log(`Independent JSON Schema conformance passed: ${cases.length} case(s).`);
