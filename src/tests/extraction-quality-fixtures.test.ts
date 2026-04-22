import assert from "node:assert/strict";
import test from "node:test";

import { buildContentAwareExtractionCandidates } from "../lib/extraction-heuristics";
import type { AgentSearchResult } from "../types";

function createDocsFixture(): AgentSearchResult {
  return {
    title: "Automate CSV exports",
    url: "https://docs.example.com/guides/automate-csv-exports",
    snippet: "Documentation that explains how teams automate reporting exports.",
    site: "docs.example.com",
    reviewStatus: "read",
    contentType: "documentation",
    qualityScore: 0.88,
    page: {
      title: "Automate CSV exports",
      url: "https://docs.example.com/guides/automate-csv-exports",
      description: "A practical guide for exporting reports automatically.",
      h1: "Automate CSV exports",
      headings: ["Schedule exports", "Keep report schemas stable"],
      paragraphs: [
        "Teams can schedule exports to reduce repetitive reporting work and keep downstream dashboards fresh.",
        "The guide explains how to keep the report schema stable so automation does not break downstream review."
      ],
      capturedAt: "2026-03-20T12:40:00.000Z"
    }
  };
}

function createGeneralFixture(): AgentSearchResult {
  return {
    title: "Why teams automate evidence exports",
    url: "https://blog.example.com/why-teams-automate-evidence-exports",
    snippet: "Teams want automation that reduces manual evidence collection and keeps reports reusable.",
    site: "blog.example.com",
    reviewStatus: "read",
    contentType: "general",
    qualityScore: 0.8,
    page: {
      title: "Why teams automate evidence exports",
      url: "https://blog.example.com/why-teams-automate-evidence-exports",
      description: "A product blog post about workflow automation and evidence exports.",
      h1: "Why teams automate evidence exports",
      headings: ["Automation payoff", "Operational tradeoffs"],
      paragraphs: [
        "Automation helps teams reduce manual evidence collection and improves the reliability of long research workflows.",
        "The article says current reporting is too repetitive and could use better export packaging for downstream review."
      ],
      capturedAt: "2026-03-20T12:20:00.000Z"
    }
  };
}

test("extraction quality fixtures keep docs and general web pages distinct", () => {
  const docsCandidates = buildContentAwareExtractionCandidates(createDocsFixture());
  const generalCandidates = buildContentAwareExtractionCandidates(createGeneralFixture());

  assert.ok(docsCandidates.some((candidate) => candidate.method.startsWith("docs_")));
  assert.ok(generalCandidates.some((candidate) => candidate.method.startsWith("general_")));
  assert.ok(
    generalCandidates.some((candidate) => {
      const metadata = candidate.metadata as Record<string, unknown> | undefined;
      return candidate.kind === "theme" && metadata?.source === "headings";
    })
  );
});
