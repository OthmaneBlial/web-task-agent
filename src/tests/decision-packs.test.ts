import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_PACKS,
  buildDecisionPackRunPreview,
  getDecisionPack,
  renderDecisionPackPlan
} from "../packs";

test("decision packs are review-gated plans with distinct executable workflows", () => {
  assert.equal(DECISION_PACKS.length, 5);
  const pack = getDecisionPack("validate-an-idea");
  assert.ok(pack);
  assert.equal(new Set(pack?.steps.map((step) => step.workflowId)).size, pack?.steps.length);

  const plan = renderDecisionPackPlan({
    pack: pack!,
    topic: "local-first research assistant",
    preset: "focused",
    audience: "product leads",
    context: "budget is limited"
  });

  assert.match(plan, /Run one step at a time/);
  assert.match(plan, /b2b-saas-voice-of-customer/);
  assert.match(plan, /--audience "product leads"/);
  assert.match(plan, /--preset focused/);
  assert.match(plan, /Run bounds \(not a price estimate\)/);
});

test("decision pack preview exposes bounded work before any step is launched", () => {
  const pack = getDecisionPack("validate-an-idea");
  assert.ok(pack);

  const preview = buildDecisionPackRunPreview({
    pack,
    topic: "local-first research assistant",
    preset: "focused"
  });

  assert.equal(preview.steps.length, 3);
  assert.equal(preview.totalMaxQueries, 18);
  assert.equal(preview.totalMaxCandidates, 432);
  assert.equal(preview.totalMaxRuntimeHours, 15);
  assert.match(preview.steps[0].reportPath, /reports\/workflows\/b2b-saas-voice-of-customer/);
});
