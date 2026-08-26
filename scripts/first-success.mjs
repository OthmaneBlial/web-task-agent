import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-first-success-"));
const packDir = path.join(tempRoot, "pack");
const installDir = path.join(tempRoot, "clean-install");
const outputDir = path.join(tempRoot, "demo");
fs.mkdirSync(packDir, { recursive: true });
fs.mkdirSync(installDir, { recursive: true });

function run(command, args, cwd = root) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

run("npm", ["run", "build"]);
run("npm", ["pack", "--pack-destination", packDir]);
const tarball = fs.readdirSync(packDir).find((entry) => entry.endsWith(".tgz"));
if (!tarball) {
  throw new Error("npm pack did not produce a tarball");
}

run("npm", ["init", "--yes"], installDir);
run("npm", ["install", "--ignore-scripts", path.join(packDir, tarball)], installDir);
const cliPath = path.join(installDir, "node_modules", ".bin", "web-task-agent");
run(cliPath, ["demo", "export", "browser-agent-landscape", "--output", outputDir]);
const verifyOutput = run(cliPath, ["receipt", "verify", outputDir]);
if (!/Status: valid/.test(verifyOutput)) {
  throw new Error(`first-success receipt verification failed:\n${verifyOutput}`);
}

for (const required of ["receipt.html", "receipt.json", "integrity-manifest.json"]) {
  if (!fs.existsSync(path.join(outputDir, required))) {
    throw new Error(`first-success output is missing ${required}`);
  }
}

console.log("First-success passed: clean tarball install, demo export, and offline receipt verification.");
console.log(`Evidence directory: ${outputDir}`);
