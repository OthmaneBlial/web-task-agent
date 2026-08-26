import fs from "node:fs";
import path from "node:path";

import { importExternalDecisionResult } from "../dist/lib/receipt.js";

const root = process.cwd();
const inputPath = path.join(root, "examples", "interop", "browser-use-result.json");
const outputDir = path.join(root, "examples", "interop", "imported-receipt");
const result = JSON.parse(fs.readFileSync(inputPath, "utf8"));
importExternalDecisionResult({ result, outputDir, force: true });
console.log("Generated imported interoperability receipt fixture.");
