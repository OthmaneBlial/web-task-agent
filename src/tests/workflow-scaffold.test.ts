import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeWorkflowProposalId, writeWorkflowProposalScaffold } from "../workflows/scaffold";
import {
  validateWorkflowProposalDefinition,
  validateWorkflowProposalFile
} from "../workflows/proposal-validation";

test("workflow scaffold creates a reviewable definition, example, and test plan", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-scaffold-"));
  try {
    assert.equal(normalizeWorkflowProposalId("Developer Tool Review"), "developer-tool-review");
    const written = writeWorkflowProposalScaffold({ id: "Developer Tool Review", title: "Developer Tool Review", category: "Validation", outputDir: tempDir });
    assert.ok(fs.existsSync(written.definitionPath));
    assert.ok(fs.existsSync(written.fixturePath));
    assert.match(fs.readFileSync(written.examplePath, "utf8"), /not an automatically registered workflow/);
    const scaffoldValidation = validateWorkflowProposalFile(written.definitionPath);
    assert.equal(scaffoldValidation.valid, false);
    assert.ok(scaffoldValidation.errors.some((error) => error.includes("placeholder")));
    assert.throws(() => writeWorkflowProposalScaffold({ id: "Developer Tool Review", title: "Developer Tool Review", category: "Validation", outputDir: tempDir }), /refusing to overwrite/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("workflow proposal validation requires a complete, reviewable source and risk contract", () => {
  const valid = validateWorkflowProposalDefinition({
    id: "developer-tool-review",
    title: "Developer Tool Review",
    category: "Product Validation",
    decision: "Choose whether a developer tool deserves a focused pilot.",
    sourcePolicy: {
      preferred: ["official documentation", "public issue trackers", "public practitioner discussions"],
      excluded: ["authenticated pages", "access-control bypasses"]
    },
    deliverables: ["decision-ready summary", "evidence links", "contradictions"],
    queries: ["developer tool pilot evaluation criteria", "developer tool rollout complaints"],
    freshness: { maxAgeDays: 90, rationale: "Evaluate recent operator feedback and current product capabilities." },
    cost: { maxQueries: 8, maxCandidates: 40, maxRuntimeMinutes: 20 },
    risks: ["Source freshness and marketing claims can bias the recommendation"]
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.warnings.length, 2);

  const duplicateQuery = validateWorkflowProposalDefinition({
    id: "developer-tool-review",
    title: "Developer Tool Review",
    category: "Product Validation",
    decision: "Choose whether a developer tool deserves a focused pilot.",
    sourcePolicy: { preferred: ["docs", "issues", "discussions"], excluded: ["private pages"] },
    deliverables: ["summary", "evidence", "risks"],
    queries: ["same query", "same query"],
    freshness: { maxAgeDays: 90, rationale: "Use recent evidence." },
    cost: { maxQueries: 8, maxCandidates: 40, maxRuntimeMinutes: 20 },
    risks: ["Freshness"]
  });
  assert.equal(duplicateQuery.valid, false);
  assert.ok(duplicateQuery.errors.some((error) => error.includes("queries must not repeat")));

  const missingFreshnessAndCost = validateWorkflowProposalDefinition({
    id: "developer-tool-review",
    title: "Developer Tool Review",
    category: "Product Validation",
    decision: "Choose whether a developer tool deserves a focused pilot.",
    sourcePolicy: { preferred: ["docs", "issues", "discussions"], excluded: ["private pages"] },
    deliverables: ["summary", "evidence", "risks"],
    queries: ["developer tool pilot criteria", "developer tool rollout complaints"],
    risks: ["Freshness"]
  });
  assert.equal(missingFreshnessAndCost.valid, false);
  assert.ok(missingFreshnessAndCost.errors.some((error) => error.startsWith("freshness must define")));
  assert.ok(missingFreshnessAndCost.errors.some((error) => error.startsWith("cost must define")));
});
