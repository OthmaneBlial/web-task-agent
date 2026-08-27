#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "security", "review-baseline.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const expectedSurfaceIds = [
  "schema-runtime",
  "canonical-signature",
  "archive-paths",
  "url-import",
  "html-rendering",
  "local-boundary"
];

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.baselineVersion, "1.0.0");
assert.match(manifest.claimBoundary, /independent review remains required/i);
assert.deepEqual(manifest.surfaces.map((surface) => surface.id), expectedSurfaceIds);

const seenEvidence = new Set();
const reportSurfaces = manifest.surfaces.map((surface) => {
  assert.equal(typeof surface.title, "string");
  assert.ok(surface.title.trim());
  assert.ok(Array.isArray(surface.evidence) && surface.evidence.length >= 2);
  const evidence = surface.evidence.map((item) => {
    assert.equal(typeof item.path, "string");
    assert.equal(typeof item.marker, "string");
    assert.ok(item.marker.trim());
    assert.equal(path.isAbsolute(item.path), false, `${surface.id}: evidence paths must be relative`);
    assert.equal(item.path.split(/[\\/]/).includes(".."), false, `${surface.id}: evidence paths cannot escape the repository`);
    const absolutePath = path.join(root, item.path);
    const stat = fs.lstatSync(absolutePath);
    assert.equal(stat.isFile(), true, `${surface.id}: ${item.path} must be a file`);
    assert.equal(stat.isSymbolicLink(), false, `${surface.id}: ${item.path} cannot be a symbolic link`);
    const contents = fs.readFileSync(absolutePath, "utf8");
    assert.ok(contents.includes(item.marker), `${surface.id}: marker drifted in ${item.path}: ${item.marker}`);
    seenEvidence.add(item.path);
    return { path: item.path, marker: item.marker, present: true };
  });
  return { id: surface.id, title: surface.title, evidence };
});

const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.match(commit, /^[a-f0-9]{40}$/);

const report = {
  schemaVersion: 1,
  baselineVersion: manifest.baselineVersion,
  reviewedCommit: commit,
  status: "maintainer-baseline-valid",
  surfaceCount: reportSurfaces.length,
  uniqueEvidenceFiles: seenEvidence.size,
  claimBoundary: manifest.claimBoundary,
  surfaces: reportSurfaces
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Security review baseline: ${report.status}`);
  console.log(`Commit: ${report.reviewedCommit}`);
  console.log(`Coverage: ${report.surfaceCount}/6 surfaces across ${report.uniqueEvidenceFiles} evidence files`);
  console.log(`Boundary: ${report.claimBoundary}`);
  for (const surface of report.surfaces) console.log(`- ${surface.id}: ${surface.evidence.length} evidence anchors present`);
}
