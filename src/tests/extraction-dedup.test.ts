import assert from "node:assert/strict";
import test from "node:test";

import { selectUniqueExtractions } from "../lib/extraction-heuristics";
import type { AgentExtractionCandidate } from "../types";

test("near-duplicate extractions collapse to one representative per kind", () => {
  const candidates: AgentExtractionCandidate[] = [
    {
      kind: "claim",
      value: "Teams want export automation that reduces manual work today.",
      evidenceText: "Teams want export automation that reduces manual work today.",
      confidence: 0.8,
      method: "fixture"
    },
    {
      kind: "claim",
      value: "Teams want export automation that reduces manual work for finance.",
      evidenceText: "Teams want export automation that reduces manual work for finance.",
      confidence: 0.79,
      method: "fixture"
    },
    {
      kind: "feature_request",
      value: "Teams want export automation that reduces manual work for finance.",
      evidenceText: "Teams want export automation that reduces manual work for finance.",
      confidence: 0.78,
      method: "fixture"
    }
  ];

  const unique = selectUniqueExtractions(candidates);
  assert.equal(unique.filter((candidate) => candidate.kind === "claim").length, 1);
  assert.equal(unique.filter((candidate) => candidate.kind === "feature_request").length, 1);
});
