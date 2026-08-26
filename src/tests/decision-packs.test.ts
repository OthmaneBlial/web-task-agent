import assert from "node:assert/strict";
import test from "node:test";

import { DECISION_PACKS, getDecisionPack, renderDecisionPackPlan } from "../packs";

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
});
