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
        query: "claim checklist",
        queryStatus: "completed",
        rank: 1,
        sourceId: "src_1",
        documentId: "doc_1",
        title: "Checklist source",
        url: "https://docs.example.com/checklist",
        canonicalUrl: "https://docs.example.com/checklist",
        site: "docs.example.com",
        snippet: "",
        reviewStatus: "read",
        capturedAt: "2026-03-20T10:05:01.000Z",
        pageTitle: "Checklist source",
        description: "Source for the claim checklist test.",
        headings: [],
        paragraphs: [],
        contentType: "documentation",
        qualitySignals: [],
        sourceQualityScore: 0.8,
        freshnessScore: 0.9,
        trendScore: 0.8,
        overallScore: 0.84,
        extractions: [
          {
            id: "ext_1",
            sourceId: "src_1",
            documentId: "doc_1",
            kind: "claim",
            value: "Reusable summaries help operators.",
            evidenceText: "Reusable summaries help operators.",
            confidence: 0.8,
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
        averageConfidence: 0.8,
        qualityScore: 0.8,
        freshnessScore: 0.9,
        trendScore: 0.84,
        overallScore: 0.82,
        sourceIds: ["src_1"],
        evidenceIds: ["ext_1"],
        queries: ["claim checklist"],
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
        leftScore: 0.82,
        rightScore: 0.61,
        contradictionScore: 0.71,
        reason: "Manual work is still showing up in some evidence.",
        sourceIds: ["src_1"],
        evidenceIds: ["ext_1"],
        leftEvidenceValues: ["Reusable summaries help operators"],
        rightEvidenceValues: ["Manual summaries are slow"],
        queries: ["claim checklist"]
      }
    ]
  };
}

test("research summary includes a claim checklist for verification", () => {
  const summary: AgentResearchSummary = {
    executiveSummary: "Reusable summaries appear useful but manual review remains present.",
    keyFindings: ["Reusable summaries help operators."],
    contentAngles: ["Package reports for downstream reuse."],
    keyFindingDetails: [
      {
        text: "Reusable summaries help operators.",
        evidenceIds: ["ext_1"]
      }
    ],
    contentAngleDetails: [
      {
        text: "Package reports for downstream reuse.",
        evidenceIds: ["ext_1"]
      }
    ],
    referencedEvidence: [
      {
        id: "ext_1",
        sourceId: "src_1",
        query: "claim checklist",
        sourceTitle: "Checklist source",
        sourceUrl: "https://docs.example.com/checklist",
        kind: "claim",
        value: "Reusable summaries help operators.",
        confidence: 0.8,
        overallScore: 0.84
      }
    ]
  };

  const output = renderResearchSummary(summary, buildEvidenceBundle());
  assert.match(output, /### Claim Checklist/);
  assert.match(output, /- \[ \] Verify claim: Reusable summaries help operators/);
  assert.match(output, /- \[ \] Resolve disagreement: summary speed/);
});
