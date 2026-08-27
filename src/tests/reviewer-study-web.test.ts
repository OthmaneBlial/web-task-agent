import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { unzipSync } from "fflate";

import { verifyReceiptBundle, type ReceiptBundle } from "../../packages/decision-receipt/dist";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

interface PublicStudyCase {
  receiptZipBase64: string;
  tamperedReceiptZipBase64: string;
}

interface PublicStudyMaterials {
  studyVersion: string;
  cases: Record<string, PublicStudyCase>;
}

function loadMaterials(): PublicStudyMaterials {
  const context = { window: {} as { WEB_TASK_AGENT_REVIEWER_STUDY?: PublicStudyMaterials } };
  vm.runInNewContext(read("docs/assets/reviewer-study-materials.js"), context);
  assert.ok(context.window.WEB_TASK_AGENT_REVIEWER_STUDY);
  return context.window.WEB_TASK_AGENT_REVIEWER_STUDY;
}

function unzipBase64(value: string): ReceiptBundle {
  return unzipSync(Buffer.from(value, "base64"));
}

test("reviewer study page exposes a complete accessible local workflow", () => {
  const html = read("docs/study.html");
  const css = read("docs/study.css");
  execFileSync(process.execPath, ["--check", path.join(root, "docs", "study.js")]);

  assert.match(html, /Reviewer Evidence Lab/);
  assert.match(html, /id="setup-form"/);
  assert.match(html, /id="trial-form"/);
  assert.match(html, /id="download-response"/);
  assert.match(html, /id="submit-study-result"/);
  assert.match(html, /template=reviewer_value_study\.yml/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Skip to the study/);
  assert.match(html, /No analytics, cookies, account, storage, model, or API/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
});

test("reviewer study browser code has no submission, telemetry, or persistence sink", () => {
  const html = read("docs/study.html");
  const script = read("docs/study.js");

  assert.doesNotMatch(html, /<form[^>]+action=/i);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB/i);
  assert.match(script, /URL\.createObjectURL/);
  assert.match(script, /identityAttribution: false/);
  assert.match(script, /fixture: false/);
  assert.match(script, /Nothing was submitted by this page/);
  assert.match(script, /responseExported/);
  assert.match(script, /publishAnonymizedRow/);
  assert.doesNotMatch(script, /\.click\(\).*submit-study-result|window\.open/i);
});

test("embedded study ZIPs preserve valid and exact controlled-tamper outcomes", async () => {
  const materials = loadMaterials();
  assert.equal(materials.studyVersion, "1.0.0");
  const expectedPaths: Record<string, string> = {
    "case-a": "evidence/cache-policy.md",
    "case-b": "evidence/update-policy.md"
  };

  for (const [caseId, studyCase] of Object.entries(materials.cases)) {
    const valid = await verifyReceiptBundle(unzipBase64(studyCase.receiptZipBase64));
    assert.equal(valid.valid, true, `${caseId}: ${valid.errors.join("; ")}`);

    const tampered = await verifyReceiptBundle(unzipBase64(studyCase.tamperedReceiptZipBase64));
    assert.equal(tampered.valid, false);
    assert.ok(
      tampered.issues.some((issue) => issue.code === "integrity_hash_mismatch" && issue.message.includes(expectedPaths[caseId]!)),
      `${caseId}: ${tampered.errors.join("; ")}`
    );
  }
});
