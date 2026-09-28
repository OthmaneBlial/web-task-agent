import assert from "node:assert/strict";
import test from "node:test";

import type { AgentPipelineState } from "../types";
import { ensurePipelineState } from "../tasks/agent/pipeline-state";

test("pipeline normalization rejects unsupported saved stages", () => {
  const pipeline = ensurePipelineState({ planQueries: ["example query"], research: [] });
  const invalidPipeline = {
    ...pipeline,
    workItems: pipeline.workItems.map((item) => ({ ...item, nextStage: "publish" }))
  } as unknown as AgentPipelineState;

  assert.throws(
    () => ensurePipelineState({ pipeline: invalidPipeline, planQueries: ["example query"], research: [] }),
    /unsupported nextStage: publish/
  );
});

test("pipeline normalization defaults a missing legacy stage to search", () => {
  const pipeline = ensurePipelineState({ planQueries: ["example query"], research: [] });
  const item = pipeline.workItems[0]!;
  const { nextStage, ...legacyItem } = item;
  const legacyPipeline = { version: 1, workItems: [legacyItem] } as unknown as AgentPipelineState;

  assert.equal(nextStage, "search");
  assert.equal(
    ensurePipelineState({ pipeline: legacyPipeline, planQueries: ["example query"], research: [] })
      .workItems[0]!.nextStage,
    "search"
  );
});
