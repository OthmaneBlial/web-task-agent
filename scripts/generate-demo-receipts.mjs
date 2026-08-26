import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { listDemoFixtures, writeDemoPackage } = require("../dist/demos");
const outputRoot = path.resolve("examples/receipts");

for (const fixture of listDemoFixtures()) {
  writeDemoPackage({
    id: fixture.id,
    outputDir: path.join(outputRoot, fixture.id),
    force: true
  });
}

console.log(`Generated ${listDemoFixtures().length} deterministic research receipts under examples/receipts.`);
