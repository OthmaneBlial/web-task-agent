import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("security review baseline binds six threat surfaces to reproducible evidence", () => {
  const root = process.cwd();
  const output = execFileSync(process.execPath, ["scripts/security-review-baseline.mjs", "--json"], {
    cwd: root,
    encoding: "utf8"
  });
  const report = JSON.parse(output) as {
    status: string;
    surfaceCount: number;
    uniqueEvidenceFiles: number;
    claimBoundary: string;
    surfaces: Array<{ id: string; evidence: Array<{ present: boolean }> }>;
  };
  assert.equal(report.status, "maintainer-baseline-valid");
  assert.equal(report.surfaceCount, 6);
  assert.ok(report.uniqueEvidenceFiles >= 10);
  assert.match(report.claimBoundary, /independent review remains required/i);
  assert.ok(report.surfaces.every((surface) => surface.evidence.length >= 2));
  assert.ok(report.surfaces.every((surface) => surface.evidence.every((evidence) => evidence.present)));

  const form = fs.readFileSync(path.join(root, ".github", "ISSUE_TEMPLATE", "security_review_attestation.yml"), "utf8");
  assert.match(form, /private security advisory flow/);
  assert.match(form, /Do not disclose a suspected vulnerability/);
  assert.match(form, /does not mean the project is secure/);
  assert.match(form, /performed this review independently/);
});
