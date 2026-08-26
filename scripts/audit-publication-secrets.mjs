#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");
const MAX_TEXT_BYTES = 1_000_000;

const HIGH_CONFIDENCE_PATTERNS = [
  { label: "private key", pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/g },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { label: "Anthropic API key", pattern: /\bsk-ant-(?:api\d+-)?[A-Za-z0-9_-]{20,}\b/g },
  {
    label: "hard-coded credential assignment",
    pattern: /\b(?:[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)|apiKey|token|secret|password)\s*[:=]\s*["']([^"'\r\n]{16,})["']/g
  },
  {
    label: "environment credential assignment",
    pattern: /^(?:[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))=([^\s#]{16,})/gm
  }
];

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: REPOSITORY_ROOT, encoding: "utf8", ...options });
}

function trackedAndCandidateFiles() {
  return git(["ls-files", "-co", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .sort();
}

function ignoredLocalState() {
  const ignored = new Set(
    git(["check-ignore", "--stdin"], { input: ".env\n.data/\nreports/\n" })
      .split("\n")
      .filter(Boolean)
  );
  return [".env", ".data/", "reports/"].filter((candidate) => ignored.has(candidate));
}

function isTextFile(path) {
  const absolute = resolve(REPOSITORY_ROOT, path);
  const metadata = statSync(absolute);
  if (!metadata.isFile() || metadata.size > MAX_TEXT_BYTES) return false;
  return !readFileSync(absolute).subarray(0, 8_192).includes(0);
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function isClearlySynthetic(path, text, match) {
  if (path === ".env.example") return true;
  const lineStart = text.lastIndexOf("\n", match.index) + 1;
  const lineEnd = text.indexOf("\n", match.index);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  return /example|test|dummy|placeholder|your[_-]|local[-_](?:compatible|token)|abcdefghijklmnop/i.test(line);
}

function findSecrets(path, text) {
  const findings = [];
  for (const { label, pattern } of HIGH_CONFIDENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (!isClearlySynthetic(path, text, match)) {
        findings.push({ label, line: lineNumber(text, match.index) });
      }
    }
  }
  return findings;
}

const files = trackedAndCandidateFiles();
const findings = [];

for (const path of files) {
  if (!isTextFile(path)) continue;
  const text = readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
  for (const finding of findSecrets(path, text)) {
    findings.push({ path, ...finding });
  }
}

const ignored = ignoredLocalState();
console.log(`Publication secret audit scanned ${files.length} tracked or publishable file(s).`);
console.log(`Ignored local-state guards present: ${ignored.join(", ") || "none"}.`);

if (findings.length > 0) {
  console.error("Potential secrets were found. Values are intentionally not printed:");
  for (const finding of findings) {
    console.error(`- ${finding.path}:${finding.line} (${finding.label})`);
  }
  console.error("Remove or rotate the value, then rerun `npm run audit:secrets`.");
  process.exitCode = 1;
} else {
  console.log("No high-confidence secrets found in files Git could publish.");
}
