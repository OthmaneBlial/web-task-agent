import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildHeuristicExtractionCandidates } from "../lib/extraction-heuristics";
import { closeSharedJobDatabase, JobStore } from "../lib/job-store";
import { AgentExtractStage } from "../tasks/agent/extract-stage";
import {
  buildDirectAppBenchmarkResearch,
  buildDirectSourceResearchQueries,
  buildProvidedSourceSeedResult,
  enrichProvidedSourceSeedResult,
  isDirectAppUrl,
  parseAppBrainAppId,
  extractInstructionUrls
} from "../tasks/agent/direct-source";
import { createDefaultAgentExtractor } from "../tasks/agent/extractors/heuristic-extractor";
import {
  assessDocumentQuality,
  evaluateDomainPolicy,
  rankSearchResults,
  rankSearchResultsForQuery
} from "../tasks/agent/shared";
import type { AgentResearchResult, AgentSearchResult } from "../types";

function createGoodResult(): AgentSearchResult {
  return {
    title: "CSV export workflow guide",
    url: "https://docs.example.com/guides/csv-export",
    snippet: "Teams use this guide to automate CSV export workflows and reduce manual reporting work.",
    site: "docs.example.com",
    reviewStatus: "read",
    qualityScore: 0.84,
    qualitySignals: ["documentation domain", "multiple paragraphs"],
    page: {
      title: "CSV export workflow guide",
      url: "https://docs.example.com/guides/csv-export",
      description: "A detailed guide that explains how product teams automate CSV exports and scheduled reports.",
      h1: "Automate CSV export workflows",
      headings: ["Why teams export data", "Schedule exports", "Common reporting pitfalls"],
      paragraphs: [
        "Teams often export CSV reports because manual analytics reviews take too much time and create reporting delays across operations and finance.",
        "This guide shows how to schedule exports, avoid duplicate reports, and keep the export schema stable for downstream analysis.",
        "Operators usually want stronger filters, fresher exports, and better audit visibility before they rely on a reporting workflow."
      ],
      capturedAt: "2026-03-20T10:00:00.000Z"
    }
  };
}

function createThinSkippedResult(): AgentSearchResult {
  return {
    title: "Category: CSV exports",
    url: "https://blog.example.com/category/csv-exports",
    snippet: "Browse posts related to CSV exports.",
    site: "blog.example.com",
    reviewStatus: "skipped",
    skipReason: "index-like page",
    policyAction: "deprioritize",
    policyReason: "domain policy: index-like page",
    qualityScore: 0.22,
    qualitySignals: ["index-like path", "thin textual content"],
    page: {
      title: "Category: CSV exports",
      url: "https://blog.example.com/category/csv-exports",
      description: "Archive page for CSV export topics.",
      h1: "Category: CSV exports",
      headings: ["Older posts"],
      paragraphs: ["Browse all CSV export posts in this category."],
      capturedAt: "2026-03-20T10:02:00.000Z"
    }
  };
}

function createForumResult(): AgentSearchResult {
  return {
    title: "Need AI summary automation for long research workflows",
    url: "https://community.example.com/discussions/ai-summary-automation",
    snippet: "Operators say manual synthesis is too slow and they want AI help for long research jobs.",
    site: "community.example.com",
    reviewStatus: "read",
    qualityScore: 0.86,
    qualitySignals: ["community discussion", "multiple paragraphs"],
    page: {
      title: "Need AI summary automation for long research workflows",
      url: "https://community.example.com/discussions/ai-summary-automation",
      description: "A community discussion where operators ask for AI summary automation across hundreds of research pages.",
      h1: "Need AI summary automation for long research workflows",
      headings: ["Why manual synthesis is too slow", "Requested workflow improvements"],
      paragraphs: [
        "Our team needs AI summary automation for long research workflows because manual synthesis is too slow when a run touches hundreds of pages.",
        "We wish the pipeline would save evidence, summarize the strongest signals, and show which claims are trending across sources.",
        "Today the workaround is exporting notes manually, which is frustrating when the research job keeps running for hours."
      ],
      capturedAt: "2026-03-20T12:00:00.000Z"
    }
  };
}

function createForumResultVariant(): AgentSearchResult {
  return {
    title: "AI summary automation is needed for research pipelines",
    url: "https://reddit.com/r/automation/comments/abc123/ai_summary_automation",
    snippet: "Another operator says the team needs AI summary automation and cross-source evidence ranking.",
    site: "reddit.com",
    reviewStatus: "read",
    qualityScore: 0.82,
    qualitySignals: ["high-signal domain", "multiple paragraphs"],
    page: {
      title: "AI summary automation is needed for research pipelines",
      url: "https://reddit.com/r/automation/comments/abc123/ai_summary_automation",
      description: "Reddit discussion about AI summary automation for research workflows.",
      h1: "AI summary automation is needed for research pipelines",
      headings: ["Operator pain points", "Requested improvements"],
      paragraphs: [
        "We need AI summary automation for long research workflows because manual synthesis is too slow across hundreds of pages and sources.",
        "A useful next step would be better ranking so the pipeline reads the strongest sources first and highlights what is trending now.",
        "The current process is hard to review because evidence gets scattered across notes and exports."
      ],
      capturedAt: "2026-03-20T12:08:00.000Z"
    }
  };
}

function createReviewResult(): AgentSearchResult {
  return {
    title: "Example Research Tool Reviews 2026",
    url: "https://www.g2.com/products/example-research-tool/reviews",
    snippet: "Reviewers say the tool is useful but needs stronger AI summaries and cleaner evidence exports.",
    site: "g2.com",
    reviewStatus: "read",
    qualityScore: 0.81,
    qualitySignals: ["review signal", "multiple paragraphs"],
    page: {
      title: "Example Research Tool Reviews 2026",
      url: "https://www.g2.com/products/example-research-tool/reviews",
      description: "User reviews describing the value and limits of a research automation product.",
      h1: "Example Research Tool Reviews",
      headings: ["What users like", "What users want improved"],
      paragraphs: [
        "The product helps teams scan large sets of pages and saves time during market research.",
        "Reviewers wish the AI summary was better and say evidence exports are missing when they need a client-ready report.",
        "Some users say setup is confusing and the evidence trail is difficult to review after a long run."
      ],
      capturedAt: "2026-03-20T12:15:00.000Z"
    }
  };
}

function createStaleDocsResult(): AgentSearchResult {
  return {
    title: "CSV export workflow guide",
    url: "https://docs.example.com/guides/csv-export-legacy",
    snippet: "Legacy export guidance for analytics teams.",
    site: "docs.example.com",
    reviewStatus: "read",
    qualityScore: 0.72,
    qualitySignals: ["documentation domain", "multiple paragraphs"],
    page: {
      title: "CSV export workflow guide",
      url: "https://docs.example.com/guides/csv-export-legacy",
      description: "Older documentation about scheduled CSV exports for reporting workflows.",
      h1: "CSV export workflow guide",
      headings: ["Schedule exports", "Stable report schemas"],
      paragraphs: [
        "CSV export workflows support scheduled reporting for analytics and finance teams.",
        "This guide explains how to configure exports and keep schemas stable over time.",
        "The workflow is reliable for historical reporting but it does not discuss newer AI synthesis patterns."
      ],
      capturedAt: "2024-01-05T09:00:00.000Z"
    }
  };
}

test("domain policy and document quality identify weak research pages", () => {
  const socialPolicy = evaluateDomainPolicy({
    title: "Thread about startup growth",
    url: "https://x.com/example/status/123",
    snippet: "A short thread with opinions.",
    site: "x.com"
  });
  assert.equal(socialPolicy.action, "skip");
  assert.match(socialPolicy.reason, /domain policy/i);

  const adRedirectPolicy = evaluateDomainPolicy({
    title: "#1 AI competitor tool",
    url: "https://duckduckgo.com/y.js?ad_provider=bing&ad_domain=example.com",
    snippet: "Sponsored result",
    site: "duckduckgo.com"
  });
  assert.equal(adRedirectPolicy.action, "skip");
  assert.match(adRedirectPolicy.reason, /ad redirect/i);

  const authTitlePolicy = evaluateDomainPolicy({
    title: "Acrobat online sign in | Login to Acrobat | Adobe Acrobat",
    url: "https://www.adobe.com/acrobat/online/sign-in.html",
    snippet: "Login to Acrobat to continue.",
    site: "adobe.com"
  });
  assert.equal(authTitlePolicy.action, "skip");
  assert.match(authTitlePolicy.reason, /auth/i);

  const quality = assessDocumentQuality(
    {
      title: "Category: CSV exports",
      url: "https://blog.example.com/category/csv-exports",
      snippet: "Browse posts related to CSV exports."
    },
    createThinSkippedResult().page!
  );
  assert.equal(quality.readable, false);
  assert.ok(quality.score < 0.45);
  assert.ok(quality.signals.some((signal) => signal.includes("index") || signal.includes("thin")));
});

test("search ranking prioritizes higher-signal research pages", () => {
  const ranked = rankSearchResults([
    {
      title: "Pricing",
      url: "https://example.com/pricing",
      snippet: "Plans and enterprise pricing.",
      site: "example.com"
    },
    createForumResult(),
    createGoodResult(),
    createThinSkippedResult()
  ]);

  assert.equal(ranked[0]?.contentType, "documentation");
  assert.ok((ranked[0]?.rankingScore ?? 0) >= (ranked[1]?.rankingScore ?? 0));
  assert.equal(ranked.at(-1)?.policyAction, "deprioritize");
  assert.ok((ranked[0]?.rankingSignals?.length ?? 0) > 0);
});

test("query-aware ranking prefers store and community sources for android app research", () => {
  const playStoreRanked = rankSearchResultsForQuery(
    [
      {
        title: "Easy to use Online PDF editor - Sejda",
        url: "https://www.sejda.com/pdf-editor",
        snippet: "Edit PDF files online for free.",
        site: "sejda.com"
      },
      {
        title: "PDF Editor - Apps on Google Play",
        url: "https://play.google.com/store/apps/details?id=com.example.pdfeditor",
        snippet: "Ratings, reviews, and app details for PDF Editor.",
        site: "play.google.com"
      }
    ],
    'site:play.google.com "pdf editor" app reviews complaints'
  );
  assert.equal(playStoreRanked[0]?.site, "play.google.com");

  const redditRanked = rankSearchResultsForQuery(
    [
      {
        title: "iLovePDF | Online PDF tools for PDF lovers",
        url: "https://www.ilovepdf.com/",
        snippet: "All the tools you need for PDF editing online.",
        site: "ilovepdf.com"
      },
      {
        title: "Best PDF editor for Android? : r/AndroidApps - Reddit",
        url: "https://www.reddit.com/r/AndroidApps/comments/example/best_pdf_editor/",
        snippet: "Users discuss complaints, subscriptions, and app alternatives.",
        site: "reddit.com"
      }
    ],
    '"pdf editor" android app reddit complaints'
  );
  assert.equal(redditRanked[0]?.site, "reddit.com");
});

test("direct source helper extracts urls and builds targeted play store queries", () => {
  const instruction =
    'Why this app is getting practically 0 downloads? Rewrite its ASO: https://play.google.com/store/apps/details?id=com.nanocv.app.';
  const urls = extractInstructionUrls(instruction);

  assert.deepEqual(urls, ["https://play.google.com/store/apps/details?id=com.nanocv.app"]);

  const seed = buildProvidedSourceSeedResult(urls[0]!);
  seed.title = "Resume Builder Offline";
  seed.page = {
    title: "Resume Builder Offline - Apps on Google Play",
    url: urls[0]!,
    description: "Create professional resumes offline. 100% private, no signup.",
    h1: "Resume Builder Offline",
    headings: ["About this app", "BUSINESS", "Stack Attack", "Current ASO audit"],
    paragraphs: [
      "Create professional resumes offline. 100% private, no signup.",
      "Build a job-winning resume in minutes with NanoCV, the secure offline resume builder."
    ],
    capturedAt: "2026-03-21T11:00:00.000Z"
  };

  const queries = buildDirectSourceResearchQueries({
    instruction,
    directResearch: [
      {
        query: `Provided source: ${urls[0]!}`,
        searchedAt: "2026-03-21T11:00:00.000Z",
        results: [seed]
      }
    ],
    maxQueries: 5
  });

  assert.ok(queries.length >= 10);
  assert.ok(queries.some((query) => /resume builder/i.test(query)));
  assert.ok(queries.some((query) => /site:play\.google\.com/i.test(query)));
  assert.ok(queries.some((query) => /site:reddit\.com/i.test(query)));
});

test("direct source query builder ignores placeholder titles and falls back to package id", () => {
  const instruction =
    "Rewrite ASO for https://play.google.com/store/apps/details?id=com.nanocv.app";

  const queries = buildDirectSourceResearchQueries({
    instruction,
    directResearch: [
      {
        query: "Provided source: https://play.google.com/store/apps/details?id=com.nanocv.app",
        searchedAt: "2026-03-21T12:00:00.000Z",
        results: [
          {
            title: "Provided source URL: play.google.com",
            url: "https://play.google.com/store/apps/details?id=com.nanocv.app",
            snippet: "Source URL provided directly in the instruction.",
            site: "play.google.com",
            reviewStatus: "error",
            skipReason: "WebSocket connection closed"
          }
        ]
      }
    ],
    maxQueries: 5
  });

  assert.ok(queries.length >= 6);
  assert.ok(queries.some((query) => query.includes("com.nanocv.app")));
});

test("play store seed enrichment builds rich aso evidence without browser fetch", async () => {
  const seeded = await enrichProvidedSourceSeedResult(
    buildProvidedSourceSeedResult("https://play.google.com/store/apps/details?id=com.nanocv.app")
  );

  assert.equal(seeded.title, "Resume Builder Offline");
  assert.equal(seeded.reviewStatus, "read");
  assert.equal(seeded.contentType, "review");
  assert.ok((seeded.qualityScore ?? 0) >= 0.85);
  assert.ok(seeded.page);
  assert.equal(seeded.page?.h1, "Resume Builder Offline");
  assert.match(seeded.page?.description ?? "", /Create professional resumes offline/i);
  assert.ok((seeded.page?.headings ?? []).some((heading: string) => /Business/i.test(heading)));
  assert.ok((seeded.page?.paragraphs ?? []).some((paragraph: string) => /ATS/i.test(paragraph)));
});

test("appbrain direct links resolve app ids and use the direct app audit path", async () => {
  const appBrainUrl = "https://www.appbrain.com/app/nanocv-offline-resume-builder/com.nanocv.app";
  assert.equal(parseAppBrainAppId(appBrainUrl), "com.nanocv.app");
  assert.equal(isDirectAppUrl(appBrainUrl), true);

  const seeded = await enrichProvidedSourceSeedResult(
    buildProvidedSourceSeedResult(appBrainUrl)
  );

  assert.equal(seeded.title, "Resume Builder Offline");
  assert.equal(seeded.reviewStatus, "read");
  assert.equal(seeded.contentType, "review");
  assert.ok((seeded.page?.paragraphs ?? []).some((paragraph: string) => /NanoCV/i.test(paragraph)));

  const queries = buildDirectSourceResearchQueries({
    instruction: `Audit this app URL: ${appBrainUrl}`,
    directResearch: [
      {
        query: `Provided source: ${appBrainUrl}`,
        searchedAt: "2026-03-21T13:00:00.000Z",
        results: [seeded]
      }
    ],
    maxQueries: 5
  });

  assert.ok(queries.length >= 6);
  assert.ok(queries.some((query) => /resume builder/i.test(query)));
});

test("direct app benchmark research finds market visibility and competitors", async () => {
  const seeded = await enrichProvidedSourceSeedResult(
    buildProvidedSourceSeedResult("https://www.appbrain.com/app/nanocv-offline-resume-builder/com.nanocv.app")
  );
  const benchmark = await buildDirectAppBenchmarkResearch(seeded);

  assert.ok(benchmark);
  assert.match(benchmark?.query ?? "", /Play Store benchmark/i);
  assert.ok((benchmark?.results.length ?? 0) >= 2);
  assert.match(benchmark?.results[0]?.title ?? "", /Play Store benchmark/i);
  assert.ok(
    (benchmark?.results[0]?.page?.paragraphs ?? []).some((paragraph: string) =>
      /top visible competitors|not found|appears at play store search rank/i.test(paragraph)
    )
  );
});

test("extractor filters boilerplate headings from theme extraction", () => {
  const candidates = buildHeuristicExtractionCandidates({
    title: "What apps do students use?",
    url: "https://reddit.com/r/study/comments/example",
    snippet: "Students discuss planning apps and time-blocking habits.",
    site: "reddit.com",
    reviewStatus: "read",
    qualityScore: 0.84,
    page: {
      title: "What apps do students use?",
      url: "https://reddit.com/r/study/comments/example",
      description: "A forum thread about study planner apps.",
      h1: "What apps do students use?",
      headings: ["View Post in", "Top Posts", "Conclusion", "1. Todoist", "Requested workflow improvements"],
      paragraphs: [
        "Students say they want an app that can throw tasks into a time-blocked day automatically.",
        "Many replies ask for free alternatives and less manual setup."
      ],
      capturedAt: "2026-03-20T12:30:00.000Z"
    }
  });

  const themeValues = candidates
    .filter((candidate) => candidate.kind === "theme")
    .map((candidate) => candidate.value.toLowerCase());

  assert.ok(!themeValues.includes("view post in"));
  assert.ok(!themeValues.includes("top posts"));
  assert.ok(!themeValues.includes("conclusion"));
  assert.ok(!themeValues.includes("1. todoist"));
  assert.ok(themeValues.includes("requested workflow improvements"));
});

test("default extractor uses source-specific heuristics for docs forums and reviews", () => {
  const extractor = createDefaultAgentExtractor();

  const docsMethods = extractor.extractFromResult(createGoodResult()).map((item) => item.method);
  const forumMethods = extractor.extractFromResult(createForumResult()).map((item) => item.method);
  const reviewMethods = extractor.extractFromResult(createReviewResult()).map((item) => item.method);

  assert.ok(docsMethods.some((method) => method.startsWith("docs_")));
  assert.ok(forumMethods.some((method) => method.startsWith("forum_")));
  assert.ok(reviewMethods.some((method) => method.startsWith("review_")));
});

test("extractor skips low-quality results and persists only readable evidence", () => {
  const goodResult = createGoodResult();
  const skippedResult = createThinSkippedResult();

  assert.ok(buildHeuristicExtractionCandidates(goodResult).length > 0);
  assert.equal(buildHeuristicExtractionCandidates(skippedResult).length, 0);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-quality-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const jobStore = new JobStore({
      databasePath,
      jobId: "job_quality",
      taskType: "agent",
      workflowName: "article-research",
      title: "Research Quality Test",
      instruction: "Harden research quality",
      status: "running",
      startedAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      artifactDir: tempDir,
      cachePath: path.join(tempDir, "cache.json"),
      reportPath: path.join(tempDir, "report.md"),
      input: {
        instruction: "Harden research quality"
      },
      budget: {},
      output: {}
    });
    const stage = new AgentExtractStage(
      jobStore,
      tempDir,
      {
        id: "test_search",
        buildSearchUrl: (query) => `https://search.example.com/?q=${encodeURIComponent(query)}`
      },
      createDefaultAgentExtractor()
    );

    const research: AgentResearchResult = {
      query: "csv export automation",
      searchedAt: "2026-03-20T10:05:00.000Z",
      results: [goodResult, skippedResult]
    };

    const persisted = stage.persistQueryResult(research);
    assert.equal(persisted.sourceCount, 2);
    assert.equal(persisted.documentCount, 2);
    assert.ok(persisted.extractionCount > 0);

    const evidence = jobStore.getAgentEvidenceBundle();
    const readableSource = evidence.sources.find((source) =>
      source.url.includes("docs.example.com/guides/csv-export")
    );
    const thinSource = evidence.sources.find((source) =>
      source.url.includes("blog.example.com/category/csv-exports")
    );

    assert.ok(readableSource);
    assert.ok((readableSource?.extractions.length ?? 0) > 0);
    assert.ok(thinSource);
    assert.equal(thinSource?.reviewStatus, "skipped");
    assert.equal(thinSource?.skipReason, "index-like page");
    assert.equal(thinSource?.extractions.length, 0);
  } finally {
    closeSharedJobDatabase(databasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("evidence bundle scores fresh repeated signals higher for trend detection", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-trend-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const jobStore = new JobStore({
      databasePath,
      jobId: "job_trend",
      taskType: "agent",
      workflowName: "android-opportunity",
      title: "Trend Test",
      instruction: "Score fresh repeated research signals",
      status: "running",
      startedAt: "2026-03-20T12:00:00.000Z",
      updatedAt: "2026-03-20T12:00:00.000Z",
      artifactDir: tempDir,
      cachePath: path.join(tempDir, "cache.json"),
      reportPath: path.join(tempDir, "report.md"),
      input: {
        instruction: "Score fresh repeated research signals"
      },
      budget: {},
      output: {}
    });
    const stage = new AgentExtractStage(
      jobStore,
      tempDir,
      {
        id: "test_search",
        buildSearchUrl: (query) => `https://search.example.com/?q=${encodeURIComponent(query)}`
      },
      createDefaultAgentExtractor()
    );

    const research: AgentResearchResult = {
      query: "ai research workflow demand",
      searchedAt: "2026-03-20T12:20:00.000Z",
      results: [createForumResult(), createForumResultVariant(), createStaleDocsResult()]
    };

    stage.persistQueryResult(research);
    const evidence = jobStore.getAgentEvidenceBundle();

    const freshSource = evidence.sources.find((source) =>
      source.url.includes("community.example.com/discussions/ai-summary-automation")
    );
    const staleSource = evidence.sources.find((source) =>
      source.url.includes("csv-export-legacy")
    );
    const trendingCluster = evidence.clusters.find((cluster) =>
      cluster.label.toLowerCase().includes("ai summary automation")
    );

    assert.ok(freshSource);
    assert.ok(staleSource);
    assert.ok((freshSource?.trendScore ?? 0) > (staleSource?.trendScore ?? 0));
    assert.ok(trendingCluster);
    assert.ok((trendingCluster?.sourceCount ?? 0) >= 2);
    assert.ok((trendingCluster?.trendScore ?? 0) >= 0.65);
  } finally {
    closeSharedJobDatabase(databasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
