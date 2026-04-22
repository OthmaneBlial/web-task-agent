import assert from "node:assert/strict";
import test from "node:test";

import { renderResearchSummary } from "../tasks/agent/synthesis-stage";
import type { AgentEvidenceBundle, AgentResearchSummary } from "../types";

function buildEvidenceBundle(): AgentEvidenceBundle {
  return {
    counts: {
      queries: 1,
      sources: 2,
      documents: 2,
      extractions: 2,
      clusters: 0,
      contradictions: 0
    },
    queries: [],
    sources: [
      {
        query: "citation order",
        queryStatus: "completed",
        rank: 1,
        sourceId: "src_1",
        documentId: "doc_1",
        title: "Alpha guide",
        url: "https://example.com/alpha",
        canonicalUrl: "https://example.com/alpha",
        site: "example.com",
        snippet: "",
        reviewStatus: "read",
        headings: [],
        paragraphs: [],
        contentType: "documentation",
        qualitySignals: [],
        sourceQualityScore: 0.8,
        freshnessScore: 0.8,
        trendScore: 0.8,
        overallScore: 0.8,
        extractions: [
          {
            id: "ext_1",
            sourceId: "src_1",
            documentId: "doc_1",
            kind: "claim",
            value: "Alpha claim",
            evidenceText: "Alpha claim",
            confidence: 0.8,
            method: "fixture"
          }
        ]
      },
      {
        query: "citation order",
        queryStatus: "completed",
        rank: 2,
        sourceId: "src_2",
        documentId: "doc_2",
        title: "Zulu guide",
        url: "https://example.com/zulu",
        canonicalUrl: "https://example.com/zulu",
        site: "example.com",
        snippet: "",
        reviewStatus: "read",
        headings: [],
        paragraphs: [],
        contentType: "documentation",
        qualitySignals: [],
        sourceQualityScore: 0.8,
        freshnessScore: 0.8,
        trendScore: 0.8,
        overallScore: 0.8,
        extractions: [
          {
            id: "ext_2",
            sourceId: "src_2",
            documentId: "doc_2",
            kind: "claim",
            value: "Zulu claim",
            evidenceText: "Zulu claim",
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
      claims: []
    },
    clusters: [],
    contradictions: []
  };
}

test("research summary evidence references render in stable source-title order", () => {
  const summary: AgentResearchSummary = {
    executiveSummary: "Stable reference ordering matters.",
    keyFindings: [],
    contentAngles: [],
    keyFindingDetails: [],
    contentAngleDetails: [],
    referencedEvidence: [
      {
        id: "ext_2",
        sourceId: "src_2",
        query: "citation order",
        sourceTitle: "Zulu guide",
        sourceUrl: "https://example.com/zulu",
        kind: "claim",
        value: "Zulu claim",
        confidence: 0.8,
        overallScore: 0.8
      },
      {
        id: "ext_1",
        sourceId: "src_1",
        query: "citation order",
        sourceTitle: "Alpha guide",
        sourceUrl: "https://example.com/alpha",
        kind: "claim",
        value: "Alpha claim",
        confidence: 0.8,
        overallScore: 0.8
      }
    ]
  };

  const output = renderResearchSummary(summary, buildEvidenceBundle());
  const alphaIndex = output.indexOf("Alpha guide");
  const zuluIndex = output.indexOf("Zulu guide");

  assert.ok(alphaIndex >= 0);
  assert.ok(zuluIndex >= 0);
  assert.ok(alphaIndex < zuluIndex);
});
