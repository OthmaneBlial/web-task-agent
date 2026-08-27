import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const copies = [
  ["schema/decision-receipt.v1.schema.json", "packages/decision-receipt/schema/decision-receipt.v1.schema.json"],
  ["conformance/cases.json", "packages/decision-receipt/conformance/cases.json"]
];
const drift = [];

for (const [sourceRelative, targetRelative] of copies) {
  const source = path.join(root, sourceRelative);
  const target = path.join(root, targetRelative);
  const sourceBytes = fs.readFileSync(source);
  const targetBytes = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (targetBytes && sourceBytes.equals(targetBytes)) continue;
  drift.push(targetRelative);
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

if (checkOnly && drift.length > 0) {
  throw new Error(`Decision Receipt spec mirrors are stale:\n${drift.map((item) => `- ${item}`).join("\n")}`);
}

console.log(drift.length === 0 ? "Decision Receipt spec mirrors are up to date." : `Synchronized ${drift.length} Decision Receipt spec file(s).`);
