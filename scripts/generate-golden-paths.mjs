import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceByPath = {
  "decision-change-review": "browser-agent-landscape",
  "competitor-map": "competitor-decision-map",
  "launch-risk-review": "product-launch-readiness"
};

for (const [goldenPath, sourceId] of Object.entries(sourceByPath)) {
  const source = path.join(root, "examples", "receipts", sourceId, "receipt.html");
  const destination = path.join(root, "examples", "golden-paths", goldenPath, "receipt.html");
  if (!fs.existsSync(source)) {
    throw new Error(`source receipt is missing: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

console.log(`Generated ${Object.keys(sourceByPath).length} golden-path receipt fixtures.`);
