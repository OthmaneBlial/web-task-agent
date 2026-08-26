import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("contribution loop exposes safe forms for feedback and case studies", () => {
  const root = process.cwd();
  for (const file of [
    ".github/ISSUE_TEMPLATE/golden_path_feedback.yml",
    ".github/ISSUE_TEMPLATE/receipt_case_study.yml",
    "docs/content/case-studies.md",
    "docs/activation.md"
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  }
  const feedbackForm = fs.readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/golden_path_feedback.yml"), "utf8");
  assert.match(feedbackForm, /Never include API keys/);
  assert.match(feedbackForm, /Decision Change Review/);
  assert.match(feedbackForm, /First-success install/);
  const activation = fs.readFileSync(path.join(root, "docs/activation.md"), "utf8");
  assert.match(activation, /No event is sent by the CLI/);
  assert.match(activation, /first_success_completed/);
});
