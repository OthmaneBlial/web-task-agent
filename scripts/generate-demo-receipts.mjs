import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { listDemoFixtures, writeDemoPackage } = require("../dist/demos");
const outputRoot = path.resolve("examples/receipts");
const featuredDemoId = "browser-agent-landscape";
let featuredReceiptPath = "";

for (const fixture of listDemoFixtures()) {
  const written = writeDemoPackage({
    id: fixture.id,
    outputDir: path.join(outputRoot, fixture.id),
    force: true
  });
  if (fixture.id === featuredDemoId) {
    featuredReceiptPath = written.receiptPath;
  }
}

if (!featuredReceiptPath) {
  throw new Error(`Featured demo fixture is missing: ${featuredDemoId}`);
}

fs.copyFileSync(featuredReceiptPath, path.resolve("docs/receipt.html"));

console.log(
  `Generated ${listDemoFixtures().length} deterministic research receipts under examples/receipts and the featured public receipt.`
);
