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
      clusters: 2,
      contradictions: 0
    },
    queries: [],
    sources: [
      {
        query: "recommendation generation",
        queryStatus: "completed",
        rank: 1,
        sourceId: "src_1",
        documentId: "doc_1",
        title: "Complaint source",
        url: "https://community.example.com/complaint",
        canonicalUrl: "https://community.example.com/complaint",
        site: "community.example.com",
        snippet: "",
        reviewStatus: "read",
        capturedAt: "2026-03-20T10:05:01.000Z",
        pageTitle: "Complaint source",
        description: "Source for the recommendation test.",
        headings: [],
        paragraphs: [],
        contentType: "forum",
        qualitySignals: [],
        sourceQualityScore: 0.78,
        freshnessScore: 0.9,
        trendScore: 0.86,
        overallScore: 0.81,
        extractions: [
          {
            id: "ext_1",
            sourceId: "src_1",
            documentId: "doc_1",
            kind: "complaint",
            value: "Manual exports take too long.",
            evidenceText: "Manual exports take too long.",
            confidence: 0.78,
            method: "fixture"
          }
        ]
      },
      {
        query: "recommendation generation",
        queryStatus: "completed",
        rank: 2,
        sourceId: "src_2",
        documentId: "doc_2",
        title: "Feature request source",
        url: "https://community.example.com/feature-request",
        canonicalUrl: "https://community.example.com/feature-request",
        site: "community.example.com",
        snippet: "",
        reviewStatus: "read",
        capturedAt: "2026-03-20T10:05:02.000Z",
        pageTitle: "Feature request source",
        description: "Source for the recommendation test.",
        headings: [],
        paragraphs: [],
        contentType: "forum",
        qualitySignals: [],
        sourceQualityScore: 0.79,
        freshnessScore: 0.89,
        trendScore: 0.85,
        overallScore: 0.8,
        extractions: [
          {
            id: "ext_2",
            sourceId: "src_2",
            documentId: "doc_2",
            kind: "feature_request",
            value: "Need scheduled exports.",
            evidenceText: "Need scheduled exports.",
            confidence: 0.8,
            method: "fixture"
          }
        ]
      }
    ],
    highlights: {
      entities: [],
      themes: [],
      complaints: ["Manual exports take too long."],
      featureRequests: ["Need scheduled exports."],
      claims: []
    },
    clusters: [
      {
        id: "cluster_complaint_001",
        kind: "complaint",
        label: "Manual exports take too long",
        sourceCount: 1,
        evidenceCount: 1,
        averageConfidence: 0.78,
        qualityScore: 0.78,
        freshnessScore: 0.9,
        trendScore: 0.86,
        overallScore: 0.81,
        sourceIds: ["src_1"],
        evidenceIds: ["ext_1"],
        queries: ["recommendation generation"],
        supportingValues: ["Manual exports take too long"]
      },
      {
        id: "cluster_feature_request_001",
        kind: "feature_request",
        label: "Need scheduled exports",
        sourceCount: 1,
        evidenceCount: 1,
        averageConfidence: 0.8,
        qualityScore: 0.79,
        freshnessScore: 0.89,
        trendScore: 0.85,
        overallScore: 0.8,
        sourceIds: ["src_2"],
        evidenceIds: ["ext_2"],
        queries: ["recommendation generation"],
        supportingValues: ["Need scheduled exports"]
      }
    ],
    contradictions: []
  };
}

test("research summary generates action-oriented recommendations from clusters", () => {
  const summary: AgentResearchSummary = {
    executiveSummary: "Operators want automation and scheduled exports.",
    keyFindings: ["Manual exports take too long."],
    contentAngles: ["Build around automation and scheduled exports."],
    keyFindingDetails: [
      {
        text: "Manual exports take too long.",
        evidenceIds: ["ext_1"]
      }
    ],
    contentAngleDetails: [
      {
        text: "Build around automation and scheduled exports.",
        evidenceIds: ["ext_2"]
      }
    ],
    referencedEvidence: [
      {
        id: "ext_1",
        sourceId: "src_1",
        query: "recommendation generation",
        sourceTitle: "Complaint source",
        sourceUrl: "https://community.example.com/complaint",
        kind: "complaint",
        value: "Manual exports take too long.",
        confidence: 0.78,
        overallScore: 0.81
      },
      {
        id: "ext_2",
        sourceId: "src_2",
        query: "recommendation generation",
        sourceTitle: "Feature request source",
        sourceUrl: "https://community.example.com/feature-request",
        kind: "feature_request",
        value: "Need scheduled exports.",
        confidence: 0.8,
        overallScore: 0.8
      }
    ]
  };

  const output = renderResearchSummary(summary, buildEvidenceBundle());
  assert.match(output, /### Recommendations/);
  assert.match(output, /- Address: Manual exports take too long/);
  assert.match(output, /- Prototype: Need scheduled exports/);
});
