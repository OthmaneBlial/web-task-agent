#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";

import {
  compareDecisionReceipts,
  migrateDecisionReceipt,
  renderDecisionReceiptComparison,
  verifyReceiptBundle
} from "./index";
import type { ReceiptBundle } from "./types";

const MAX_FILES = 500;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

function usage(): never {
  process.stderr.write([
    "Decision Receipt CLI",
    "",
    "Usage:",
    "  decision-receipt verify <bundle-directory> [--json]",
    "  decision-receipt compare <earlier-directory> <later-directory> [--json]",
    "  decision-receipt migrate <receipt.json> --out <migrated.json>",
    "",
    "All operations are local. Verification proves contract and byte integrity, not source or decision truth."
  ].join("\n") + "\n");
  process.exit(2);
}

function directoryFor(input: string): string {
  const absolute = path.resolve(input);
  if (!fs.existsSync(absolute)) throw new Error(`Path does not exist: ${absolute}`);
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) return absolute;
  if (stat.isFile() && path.basename(absolute) === "receipt.json") return path.dirname(absolute);
  throw new Error("Expected a receipt bundle directory or its receipt.json file.");
}

function readBundle(input: string): ReceiptBundle {
  const root = directoryFor(input);
  const bundle: ReceiptBundle = {};
  let files = 0;
  let total = 0;
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      if (files > MAX_FILES) throw new Error(`Bundle exceeds the ${MAX_FILES}-file limit.`);
      const stat = fs.statSync(absolute);
      if (stat.size > MAX_FILE_BYTES) throw new Error(`Bundle file exceeds 10 MB: ${absolute}.`);
      total += stat.size;
      if (total > MAX_TOTAL_BYTES) throw new Error("Bundle exceeds the 50 MB total limit.");
      bundle[path.relative(root, absolute).split(path.sep).join("/")] = fs.readFileSync(absolute);
    }
  };
  visit(root);
  return bundle;
}

async function verifyCommand(input: string, json: boolean): Promise<number> {
  const result = await verifyReceiptBundle(readBundle(input));
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${result.valid ? "integrity verified" : "integrity check failed"}\n`);
    process.stdout.write(`files checked: ${result.checkedFiles}\n`);
    process.stdout.write(`signature: ${result.signatureVerified === null ? "not present" : result.signatureVerified ? "verified" : "failed"}\n`);
    for (const issue of result.issues) process.stdout.write(`- ${issue.code} ${issue.path}: ${issue.message}\n`);
    process.stdout.write("truth boundary: integrity is not proof that a source, claim, or decision is true.\n");
  }
  return result.valid ? 0 : 1;
}

async function compareCommand(earlierPath: string, laterPath: string, json: boolean): Promise<number> {
  const [earlier, later] = await Promise.all([
    verifyReceiptBundle(readBundle(earlierPath)),
    verifyReceiptBundle(readBundle(laterPath))
  ]);
  if (!earlier.receipt || !later.receipt) {
    const errors = [...earlier.errors.map((item) => `earlier: ${item}`), ...later.errors.map((item) => `later: ${item}`)];
    throw new Error(`Both bundles must pass verification before comparison.\n${errors.join("\n")}`);
  }
  const comparison = compareDecisionReceipts(earlier.receipt, later.receipt);
  process.stdout.write(renderDecisionReceiptComparison(comparison, json ? "json" : "markdown"));
  return 0;
}

function migrateCommand(inputPath: string, outputPath: string): number {
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as unknown;
  const migration = migrateDecisionReceipt(input);
  const target = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(migration.receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`migrated ${migration.from} → ${migration.to}: ${target}\n`);
  for (const warning of migration.warnings) process.stdout.write(`warning: ${warning}\n`);
  return 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift();
  const jsonIndex = args.indexOf("--json");
  const json = jsonIndex >= 0;
  if (json) args.splice(jsonIndex, 1);

  let code: number;
  if (command === "verify" && args.length === 1) {
    code = await verifyCommand(args[0]!, json);
  } else if (command === "compare" && args.length === 2) {
    code = await compareCommand(args[0]!, args[1]!, json);
  } else if (command === "migrate") {
    const outputIndex = args.indexOf("--out");
    if (outputIndex < 0 || !args[0] || !args[outputIndex + 1]) usage();
    code = migrateCommand(args[0], args[outputIndex + 1]!);
  } else {
    usage();
  }
  process.exitCode = code;
}

main().catch((error) => {
  process.stderr.write(`decision-receipt: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
