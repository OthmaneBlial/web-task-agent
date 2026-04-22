import assert from "node:assert/strict";
import test from "node:test";

import type { AgentEvidenceBundle } from "../types";

function buildEvidenceBundle(): AgentEvidenceBundle {
  return {
    counts: {
      queries: 1,
      sources: 1,
      documents: 1,
      extractions: 1,
      clusters: 1,
      contradictions: 0
    },
    queries: [
      {
        query: "ai study planner",
        searchedAt: "2026-03-21T09:00:00.000Z",
        status: "completed",
        resultCount: 1,
        searchProvider: "test_search"
      }
    ],
    sources: [
      {
        query: "ai study planner",
        queryStatus: "completed",
        rank: 1,
        sourceId: "src_1",
        documentId: "doc_1",
        title: "Students keep asking for better study planning",
        url: "https://community.example.com/study-planning",
        canonicalUrl: "https://community.example.com/study-planning",
        site: "community.example.com",
        snippet: "Students want a better way to generate study plans automatically.",
        reviewStatus: "read",
        dwellSeconds: 18,
        skipReason: undefined,
        capturedAt: "2026-03-21T09:02:00.000Z",
        pageTitle: "Students keep asking for better study planning",
        description: "Community discussion about AI study planning.",
        headings: ["Student pain points", "Requested workflow improvements"],
        paragraphs: [
          "Students say manual study planning takes too much time every week.",
          "They want AI study schedule generation with better prioritization and reminders."
        ],
        contentType: "forum",
        qualitySignals: ["community discussion", "multiple paragraphs"],
        sourceQualityScore: 0.82,
        freshnessScore: 0.91,
        trendScore: 0.88,
        overallScore: 0.86,
        extractions: [
          {
            id: "ext_1",
            sourceId: "src_1",
            documentId: "doc_1",
            kind: "feature_request",
            value: "AI study schedule generation",
            evidenceText: "They want AI study schedule generation with better prioritization and reminders.",
            confidence: 0.93,
            method: "test_extractor"
          }
        ]
      }
    ],
    highlights: {
      entities: [],
      themes: ["AI study planning"],
      complaints: ["manual study planning takes too much time"],
      featureRequests: ["AI study schedule generation"],
      claims: []
    },
    clusters: [
      {
        id: "cluster_1",
        kind: "feature_request",
        label: "AI study schedule generation",
        sourceCount: 1,
        evidenceCount: 1,
        averageConfidence: 0.93,
        qualityScore: 0.82,
        freshnessScore: 0.91,
        trendScore: 0.88,
        overallScore: 0.86,
        sourceIds: ["src_1"],
        evidenceIds: ["ext_1"],
        queries: ["ai study planner"],
        supportingValues: ["AI study schedule generation"]
      }
    ],
    contradictions: []
  };
}

function createLlmServiceWithResponse(
  responseText: string,
  capture?: (input: { model: string; max_tokens: number; system: string; messages: Array<{ role: string; content: string }> }) => void
) {
  const previousEnv = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL
  };

  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";

  const llmModulePath = require.resolve("../lib/llm");
  delete require.cache[llmModulePath];
  const { LlmService } = require("../lib/llm") as typeof import("../lib/llm");
  const service = new LlmService("test-model");
  const create = (async (input: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
  }) => {
    capture?.(input);
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
  }) as unknown as () => Promise<unknown>;
  (service as unknown as { anthropic: { messages: { create: () => Promise<unknown> } } }).anthropic = {
    messages: {
      create
    }
  };

  return {
    service,
    restoreEnv() {
      process.env.ANTHROPIC_API_KEY = previousEnv.apiKey;
      process.env.ANTHROPIC_BASE_URL = previousEnv.baseUrl;
      delete require.cache[llmModulePath];
    }
  };
}

test("synthesizeAgentEvidence repairs loose JSON responses with single quotes", async () => {
  const { service, restoreEnv } = createLlmServiceWithResponse(`
Here is the JSON you requested:
{
  'executiveSummary': 'Students keep asking for AI study planners.',
  'keyFindings': [
    {
      'text': 'Students want AI study schedule generation.',
      'evidenceIds': ['ext_1']
    }
  ],
  'contentAngles': [
    {
      'text': 'Why AI study schedule generation is becoming table stakes.',
      'evidenceIds': ['ext_1']
    }
  ],
}
  `);

  try {
    const summary = await service.synthesizeAgentEvidence({
      instruction: "Research Android app opportunities around AI study planning.",
      evidence: buildEvidenceBundle()
    });

    assert.equal(summary.executiveSummary, "Students keep asking for AI study planners.");
    assert.equal(summary.keyFindingDetails[0]?.evidenceIds[0], "ext_1");
    assert.equal(summary.contentAngleDetails[0]?.evidenceIds[0], "ext_1");
  } finally {
    restoreEnv();
  }
});

test("synthesizeAgentEvidence falls back to persisted evidence when JSON parsing still fails", async () => {
  const { service, restoreEnv } = createLlmServiceWithResponse(
    `The "Set expectations" angle seems strong, but I am not returning valid JSON today.`
  );

  try {
    const summary = await service.synthesizeAgentEvidence({
      instruction: "Research Android app opportunities around AI study planning.",
      evidence: buildEvidenceBundle()
    });

    assert.match(summary.executiveSummary, /Persisted evidence across 1 sources and 1 documents/i);
    assert.ok(summary.keyFindings.some((item) => item.includes("AI study schedule generation")));
    assert.ok(summary.contentAngles.some((item) => item.includes("AI study schedule generation")));
    assert.equal(summary.referencedEvidence[0]?.id, "ext_1");
  } finally {
    restoreEnv();
  }
});

test("synthesizeAgentEvidence prompt requests explicit uncertainties and recommendations", async () => {
  let capturedPrompt: string | null = null;
  let capturedSystem: string | null = null;

  const { service, restoreEnv } = createLlmServiceWithResponse(
    `{"executiveSummary":"ok","keyFindings":[],"contentAngles":[],"uncertainties":[],"recommendations":[]}`,
    (input) => {
      capturedPrompt = input.messages[0]?.content ?? null;
      capturedSystem = input.system;
    }
  );

  try {
    await service.synthesizeAgentEvidence({
      instruction: "Research Android app opportunities around AI study planning.",
      evidence: buildEvidenceBundle()
    });

    assert.match(capturedSystem ?? "", /unresolved questions/i);
    assert.match(capturedPrompt ?? "", /"uncertainties"/);
    assert.match(capturedPrompt ?? "", /"recommendations"/);
    assert.match(capturedPrompt ?? "", /Recommendations should be short, practical next steps/);
  } finally {
    restoreEnv();
  }
});
