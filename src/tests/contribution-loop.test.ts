import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("contribution loop exposes safe forms for feedback and case studies", () => {
  const root = process.cwd();
  for (const file of [
    ".github/ISSUE_TEMPLATE/golden_path_feedback.yml",
    ".github/ISSUE_TEMPLATE/receipt_case_study.yml",
    ".github/ISSUE_TEMPLATE/adapter_contribution.yml",
    ".github/ISSUE_TEMPLATE/policy_case.yml",
    ".github/ISSUE_TEMPLATE/receipt_review.yml",
    ".github/ISSUE_TEMPLATE/schema_rfc.yml",
    ".github/ISSUE_TEMPLATE/public_receipt_gallery.yml",
    ".github/ISSUE_TEMPLATE/reviewer_value_study.yml",
    "docs/content/case-studies.md",
    "docs/activation.md",
    "docs/rfcs/README.md",
    "docs/rfcs/0000-template.md",
    "MAINTAINERS.md",
    "SECURITY_REVIEW.md",
    "EXTERNAL_VALIDATION.md",
    "gallery/README.md",
    "gallery/gallery-entry.schema.json"
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  }
  const feedbackForm = fs.readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/golden_path_feedback.yml"), "utf8");
  assert.match(feedbackForm, /Never include API keys/);
  assert.match(feedbackForm, /Decision Change Review/);
  assert.match(feedbackForm, /First-success install/);
  const reviewerForm = fs.readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/reviewer_value_study.yml"), "utf8");
  assert.match(reviewerForm, /This issue is public and linked to your GitHub account/);
  assert.match(reviewerForm, /publishAnonymizedRow/);
  assert.match(reviewerForm, /never opens this form, uploads the file, or submits anything automatically/);
  const activation = fs.readFileSync(path.join(root, "docs/activation.md"), "utf8");
  assert.match(activation, /No event is sent by the CLI/);
  assert.match(activation, /first_success_completed/);

  const rfc = fs.readFileSync(path.join(root, "docs/rfcs/README.md"), "utf8");
  assert.match(rfc, /RFC is mandatory before merging any breaking Decision Receipt change/);
  assert.match(rfc, /canonical JSON or signature bytes/);
  const maintainers = fs.readFileSync(path.join(root, "MAINTAINERS.md"), "utf8");
  assert.match(maintainers, /trusted-publisher provenance/);
  assert.match(maintainers, /unknown major version/);

  const validation = fs.readFileSync(path.join(root, "EXTERNAL_VALIDATION.md"), "utf8");
  assert.match(validation, /Consenting external case studies \| 0/);
  assert.match(validation, /Negative and neutral outcomes are first-class results/);
  const securityReview = fs.readFileSync(path.join(root, "SECURITY_REVIEW.md"), "utf8");
  assert.match(securityReview, /not an independent assessment/);
  assert.match(securityReview, /What has not been independently tested/);

  const galleryReadme = fs.readFileSync(path.join(root, "gallery/README.md"), "utf8");
  assert.match(galleryReadme, /no crawler, upload service, analytics, background collection, or automatic enrolment/);
  assert.match(galleryReadme, /No entry exists yet/);
  const gallerySchema = JSON.parse(fs.readFileSync(path.join(root, "gallery/gallery-entry.schema.json"), "utf8")) as {
    additionalProperties: boolean;
    required: string[];
    properties: { consent: { properties: { optIn: { const: boolean } } } };
  };
  assert.equal(gallerySchema.additionalProperties, false);
  assert.equal(gallerySchema.properties.consent.properties.optIn.const, true);
  assert.ok(gallerySchema.required.includes("artifactLicense"));
});
