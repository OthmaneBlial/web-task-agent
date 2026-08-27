import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  importExternalDecisionResult,
  verifyReceiptDirectory
} from "../dist/lib/receipt.js";
import { requireDecisionReceiptAdapterResult } from "../dist/lib/adapter-contract.js";

const root = process.cwd();
const runs = [
  {
    id: "browser-use",
    adapterPath: "adapters/browser-use/adapter.mjs",
    exportName: "adaptBrowserUse"
  }
];

for (const run of runs) {
  const runDir = path.join(root, "examples", "interop", "runs", run.id);
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, "engine-output.json"), "utf8"));
  const adapterModule = await import(pathToFileURL(path.join(root, run.adapterPath)).href);
  const adapt = adapterModule[run.exportName];
  if (typeof adapt !== "function") throw new Error(`${run.adapterPath} does not export ${run.exportName}`);
  const result = requireDecisionReceiptAdapterResult(adapt(raw));
  fs.writeFileSync(path.join(runDir, "adapter-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const receiptDir = path.join(runDir, "receipt");
  if (fs.existsSync(receiptDir)) fs.rmSync(receiptDir, { recursive: true });
  importExternalDecisionResult({ result, outputDir: receiptDir });
  const verification = verifyReceiptDirectory(receiptDir);
  if (!verification.valid) throw new Error(`${run.id} receipt failed verification: ${verification.errors.join("; ")}`);
  process.stdout.write(`Generated and verified authentic ${run.id} receipt.\n`);
}
