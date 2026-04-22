import assert from "node:assert/strict";
import test from "node:test";

import { renderResearchSummary } from "../tasks/agent/synthesis-stage";
import type { AgentEvidenceBundle, AgentResearchSummary } from "../types";

function buildEvidenceBundle(): AgentEvidenceBundle {
  return {
    counts: {
      queries: 1,
      sources: 1,
      documents: 1,
      extractions: 1,
      clusters: 1,
      contradictions: 1
    },
    queries: [],
    sources: [
      {
        query: "summary structure",
        queryStatus: "completed",
        rank: 1,
        sourceId: "src_1",
        documentId: "doc_1",
        title: "Summary source",
        url: "https://docs.example.com/summary-source",
        canonicalUrl: "https://docs.example.com/summary-source",
        site: "docs.example.com",
        snippet: "",
        reviewStatus: "read",
        headings: [],
        paragraphs: [],
        contentType: "documentation",
        qualitySignals: [],
        sourceQualityScore: 0.81,
        freshnessScore: 0.9,
        trendScore: 0.88,
        overallScore: 0.84,
        extractions: [
          {
            id: "ext_1",
            sourceId: "src_1",
            documentId: "doc_1",
            kind: "claim",
            value: "Reusable summaries help operators.",
            evidenceText: "Reusable summaries help operators.",
            confidence: 0.81,
            method: "fixture"
          }
        ]
      }
    ],
    highlights: {
      entities: [],
      themes: [],
      complaints: [],
      featureRequests: [],
      claims: ["Reusable summaries help operators."]
    },
    clusters: [
      {
        id: "cluster_claim_001",
        kind: "claim",
        label: "Reusable summaries help operators",
        sourceCount: 1,
        evidenceCount: 1,
        averageConfidence: 0.81,
        qualityScore: 0.81,
        freshnessScore: 0.9,
        trendScore: 0.88,
        overallScore: 0.84,
        sourceIds: ["src_1"],
        evidenceIds: ["ext_1"],
        queries: ["summary structure"],
        supportingValues: ["Reusable summaries help operators"]
      }
    ],
    contradictions: [
      {
        id: "contr_1",
        topic: "summary speed",
        leftClusterId: "cluster_claim_001",
        rightClusterId: "cluster_claim_002",
        leftKind: "claim",
        rightKind: "complaint",
        leftLabel: "Reusable summaries help operators",
        rightLabel: "Manual summaries are slow",
        leftScore: 0.84,
        rightScore: 0.6,
        contradictionScore: 0.7,
        reason: "Some sources emphasize speed while others emphasize manual review overhead.",
        sourceIds: ["src_1"],
        evidenceIds: ["ext_1"],
        leftEvidenceValues: ["Reusable summaries help operators"],
        rightEvidenceValues: ["Manual summaries are slow"],
        queries: ["summary structure"]
      }
    ]
  };
}

test("research summary separates recommendations and uncertainties", () => {
  const summary: AgentResearchSummary = {
    executiveSummary: "Summaries help operators, but manual review is still a concern.",
    keyFindings: ["Reusable summaries help operators."],
    contentAngles: ["Prioritize reusable report packaging."],
    keyFindingDetails: [
      {
        text: "Reusable summaries help operators.",
        evidenceIds: ["ext_1"]
      }
    ],
    contentAngleDetails: [
      {
        text: "Prioritize reusable report packaging.",
        evidenceIds: ["ext_1"]
      }
    ],
    referencedEvidence: [
      {
        id: "ext_1",
        sourceId: "src_1",
        query: "summary structure",
        sourceTitle: "Summary source",
        sourceUrl: "https://docs.example.com/summary-source",
        kind: "claim",
        value: "Reusable summaries help operators.",
        confidence: 0.81,
        overallScore: 0.84
      }
    ]
  };

  const output = renderResearchSummary(summary, buildEvidenceBundle());
  assert.match(output, /### Recommendations/);
  assert.match(output, /### Uncertainties/);
  assert.match(output, /Focus on: Prioritize reusable report packaging\./);
  assert.match(output, /Some sources emphasize speed while others emphasize manual review overhead\./);
});
