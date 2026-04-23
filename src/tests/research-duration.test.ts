import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTaskState } from "../lib/cache";
import { closeSharedJobDatabase } from "../lib/job-store";
import { currentUtcYear } from "../tasks/agent/shared";
import type {
  AgentPlan,
  AgentResearchSummary,
  AgentRunState,
  AgentSearchResult
} from "../types";

function buildPlan(initialQuery: string): AgentPlan {
  return {
    summary: "Research AI automation demand",
    tone: "direct",
    estimatedMinutes: 15,
    approvalRequired: false,
    deliverables: ["report"],
    researchQueries: [initialQuery],
    steps: [
      {
        id: "step_research",
        kind: "research",
        title: "Research the topic",
        goal: "Collect evidence",
        status: "pending"
      },
      {
        id: "step_report",
        kind: "report",
        title: "Write report",
        goal: "Package findings",
        status: "pending"
      }
    ]
  };
}

function buildSearchResult(input: {
  title: string;
  site: string;
  url: string;
  paragraph: string;
}): AgentSearchResult {
  return {
    title: input.title,
    url: input.url,
    snippet: input.paragraph,
    site: input.site,
    reviewStatus: "read",
    dwellSeconds: 12,
    contentType: "documentation",
    page: {
      title: input.title,
      url: input.url,
      description: input.paragraph,
      h1: input.title,
      headings: ["Operator notes", "Repeated requests"],
      paragraphs: [
        input.paragraph,
        `${input.paragraph} Teams keep repeating this need across long-running research workflows.`
      ],
      capturedAt: "2026-03-21T10:00:00.000Z"
    }
  };
}

test("research duration front-loads durable queries and filters repeated sites", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-research-duration-"));
  const cachePath = path.join(tempDir, "agent-cache.json");
  const reportPath = path.join(tempDir, "artifacts", "report.md");
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const currentYear = currentUtcYear();
  const initialQuery = "ai research automation operator complaints";
  const followUpQuery = "ai research automation community threads";
  const previousEnv = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    databasePath: process.env.WEB_TASK_AGENT_DB_PATH
  };

  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";
  process.env.WEB_TASK_AGENT_DB_PATH = databasePath;

  const cdpModule = require("../lib/cdp") as typeof import("../lib/cdp");
  const llmModule = require("../lib/llm") as typeof import("../lib/llm");
  const searchAdapterModule = require("../tasks/agent/search-adapters/duckduckgo-html") as typeof import("../tasks/agent/search-adapters/duckduckgo-html");
  const originalEnsureDebuggerReady = cdpModule.ensureDebuggerReady;
  const originalPlanAgentJob = llmModule.LlmService.prototype.planAgentJob;
  const originalExpandAgentResearchQueries =
    llmModule.LlmService.prototype.expandAgentResearchQueries;
  const originalSynthesizeAgentEvidence =
    llmModule.LlmService.prototype.synthesizeAgentEvidence;
  const originalCreateDefaultAgentSearchAdapter =
    searchAdapterModule.createDefaultAgentSearchAdapter;
  const originalDateNow = Date.now;

  let expandCalls = 0;
  let simulatedNow = originalDateNow();

  cdpModule.ensureDebuggerReady = async () => {};
  Date.now = () => {
    simulatedNow += 20_000;
    return simulatedNow;
  };
  llmModule.LlmService.prototype.planAgentJob = async function planStub() {
    return buildPlan(initialQuery);
  };
  llmModule.LlmService.prototype.expandAgentResearchQueries =
    async function expandStub() {
      expandCalls += 1;
      return expandCalls === 1 ? [followUpQuery] : [];
    };
  llmModule.LlmService.prototype.synthesizeAgentEvidence =
    async function synthesizeStub() {
      return {
        executiveSummary: "Operators want broader automation coverage and cleaner evidence packaging.",
        keyFindings: ["Operators keep asking for deeper automation coverage."],
        contentAngles: ["How research agents can keep expanding without looping on the same sites."],
        keyFindingDetails: [],
        contentAngleDetails: [],
        referencedEvidence: []
      } satisfies AgentResearchSummary;
    };
  searchAdapterModule.createDefaultAgentSearchAdapter = function searchStubFactory() {
    return {
      id: "stub_search",
      label: "Stub Search Adapter",
      buildSearchUrl(query: string) {
        return `https://search.example.com/?q=${encodeURIComponent(query)}`;
      },
      async search(query: string) {
        if (query.includes("operator complaints")) {
          return {
            query,
            searchedAt: "2026-03-21T10:00:00.000Z",
            searchUrl: `https://search.example.com/?q=${encodeURIComponent(query)}`,
            searchProvider: "stub_search",
            pagesVisited: 1,
            exhausted: true,
            results: [
              buildSearchResult({
                title: "Covered Operator Guide",
                site: "covered.example.com",
                url: "https://covered.example.com/operator-guide",
                paragraph:
                  "Research operators complain that manual evidence gathering stays too repetitive and they want automation that can keep exploring fresh sources."
              })
            ]
          };
        }

        return {
          query,
          searchedAt: "2026-03-21T10:01:00.000Z",
          searchUrl: `https://search.example.com/?q=${encodeURIComponent(query)}`,
          searchProvider: "stub_search",
          pagesVisited: 1,
          exhausted: true,
          results: [
            buildSearchResult({
              title: "Covered Site Again",
              site: "covered.example.com",
              url: "https://covered.example.com/community-thread",
              paragraph:
                "The same covered site appears again, but duration mode should skip it because the run already captured that domain earlier."
            }),
            buildSearchResult({
              title: "Fresh Community Thread",
              site: "novel.example.com",
              url: "https://novel.example.com/community-thread",
              paragraph:
                "A fresh community thread describes teams who need research jobs to keep expanding coverage until the time budget is exhausted."
            })
          ]
        };
      }
    };
  };

  delete require.cache[require.resolve("../tasks/agent-runner")];

  try {
    const { AgentRunnerTask } = require("../tasks/agent-runner") as typeof import("../tasks/agent-runner");
    const task = new AgentRunnerTask({
      instruction: "Research how teams want web research agents to keep expanding coverage.",
      resume: false,
      cachePath,
      reportPath,
      maxQueries: 2,
      maxResultsPerQuery: 5,
      fetchBatchSize: 5,
      researchDurationMinutes: 5,
      maxRuntimeHours: 2
    });

    const result = await task.run();
    const savedState = loadTaskState<AgentRunState>(cachePath);
    const initialQueryWithYear = `${initialQuery} ${currentYear}`;
    const repeatedSiteEntries = savedState.research.filter(
      (entry) =>
        entry.query !== initialQueryWithYear &&
        entry.results.some((result) => result.site === "covered.example.com")
    );

    assert.equal(result.status, "completed");
    assert.ok(fs.existsSync(reportPath));
    assert.ok(savedState.plan?.researchQueries.includes(initialQueryWithYear));
    assert.ok(
      savedState.plan?.researchQueries.some(
        (query) =>
          query !== initialQueryWithYear &&
          /\b(?:latest|user reviews|complaints|alternatives|comparison)\b/i.test(query)
      )
    );
    assert.ok(
      savedState.research.some((entry) =>
        entry.results.some((result) => result.site === "novel.example.com")
      )
    );
    assert.equal(repeatedSiteEntries.length, 0);
  } finally {
    cdpModule.ensureDebuggerReady = originalEnsureDebuggerReady;
    llmModule.LlmService.prototype.planAgentJob = originalPlanAgentJob;
    llmModule.LlmService.prototype.expandAgentResearchQueries =
      originalExpandAgentResearchQueries;
    llmModule.LlmService.prototype.synthesizeAgentEvidence =
      originalSynthesizeAgentEvidence;
    searchAdapterModule.createDefaultAgentSearchAdapter =
      originalCreateDefaultAgentSearchAdapter;
    Date.now = originalDateNow;
    delete require.cache[require.resolve("../tasks/agent-runner")];
    closeSharedJobDatabase(databasePath);
    process.env.ANTHROPIC_API_KEY = previousEnv.apiKey;
    process.env.ANTHROPIC_BASE_URL = previousEnv.baseUrl;
    process.env.WEB_TASK_AGENT_DB_PATH = previousEnv.databasePath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("research duration falls back to deterministic queries and normalizes stale years", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-research-duration-fallback-"));
  const cachePath = path.join(tempDir, "agent-cache.json");
  const reportPath = path.join(tempDir, "artifacts", "report.md");
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const currentYear = currentUtcYear();
  const previousEnv = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    databasePath: process.env.WEB_TASK_AGENT_DB_PATH
  };

  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";
  process.env.WEB_TASK_AGENT_DB_PATH = databasePath;

  const cdpModule = require("../lib/cdp") as typeof import("../lib/cdp");
  const llmModule = require("../lib/llm") as typeof import("../lib/llm");
  const searchAdapterModule = require("../tasks/agent/search-adapters/duckduckgo-html") as typeof import("../tasks/agent/search-adapters/duckduckgo-html");
  const originalEnsureDebuggerReady = cdpModule.ensureDebuggerReady;
  const originalPlanAgentJob = llmModule.LlmService.prototype.planAgentJob;
  const originalExpandAgentResearchQueries =
    llmModule.LlmService.prototype.expandAgentResearchQueries;
  const originalSynthesizeAgentEvidence =
    llmModule.LlmService.prototype.synthesizeAgentEvidence;
  const originalCreateDefaultAgentSearchAdapter =
    searchAdapterModule.createDefaultAgentSearchAdapter;
  const originalDateNow = Date.now;

  const searchedQueries: string[] = [];
  let simulatedNow = originalDateNow();

  cdpModule.ensureDebuggerReady = async () => {};
  Date.now = () => {
    simulatedNow += 20_000;
    return simulatedNow;
  };
  llmModule.LlmService.prototype.planAgentJob = async function planStub() {
    return buildPlan("best offline pdf editor android 2024");
  };
  llmModule.LlmService.prototype.expandAgentResearchQueries =
    async function expandStub() {
      return [];
    };
  llmModule.LlmService.prototype.synthesizeAgentEvidence =
    async function synthesizeStub() {
      return {
        executiveSummary: "Deterministic fallback queries kept the run moving.",
        keyFindings: ["The runner did not stop when the model had no more ideas."],
        contentAngles: ["Why time-budgeted research needs a non-LLM fallback path."],
        keyFindingDetails: [],
        contentAngleDetails: [],
        referencedEvidence: []
      } satisfies AgentResearchSummary;
    };
  searchAdapterModule.createDefaultAgentSearchAdapter = function searchStubFactory() {
    return {
      id: "stub_search",
      label: "Stub Search Adapter",
      buildSearchUrl(query: string) {
        return `https://search.example.com/?q=${encodeURIComponent(query)}`;
      },
      async search(query: string) {
        searchedQueries.push(query);
        return {
          query,
          searchedAt: "2026-03-21T10:00:00.000Z",
          searchUrl: `https://search.example.com/?q=${encodeURIComponent(query)}`,
          searchProvider: "stub_search",
          pagesVisited: 1,
          exhausted: true,
          results: [
            buildSearchResult({
              title: `Source for ${query}`,
              site: `${searchedQueries.length}.example.com`,
              url: `https://${searchedQueries.length}.example.com/article`,
              paragraph:
                "This result exists so the runner can keep collecting fresh sources while the research duration budget remains active."
            })
          ]
        };
      }
    };
  };

  delete require.cache[require.resolve("../tasks/agent-runner")];

  try {
    const { AgentRunnerTask } = require("../tasks/agent-runner") as typeof import("../tasks/agent-runner");
    const task = new AgentRunnerTask({
      instruction: "Offline PDF Editor Android apps",
      resume: false,
      cachePath,
      reportPath,
      maxQueries: 2,
      maxResultsPerQuery: 5,
      fetchBatchSize: 5,
      researchDurationMinutes: 5,
      maxRuntimeHours: 2
    });

    await task.run();
    const savedState = loadTaskState<AgentRunState>(cachePath);

    assert.ok(searchedQueries.length >= 2);
    assert.equal(
      searchedQueries[0],
      `best offline pdf editor android ${currentYear}`
    );
    assert.ok(savedState.plan?.researchQueries.some((query) => query.includes(String(currentYear))));
    assert.ok(
      searchedQueries.some((query) => query !== `best offline pdf editor android ${currentYear}`)
    );
  } finally {
    cdpModule.ensureDebuggerReady = originalEnsureDebuggerReady;
    llmModule.LlmService.prototype.planAgentJob = originalPlanAgentJob;
    llmModule.LlmService.prototype.expandAgentResearchQueries =
      originalExpandAgentResearchQueries;
    llmModule.LlmService.prototype.synthesizeAgentEvidence =
      originalSynthesizeAgentEvidence;
    searchAdapterModule.createDefaultAgentSearchAdapter =
      originalCreateDefaultAgentSearchAdapter;
    Date.now = originalDateNow;
    delete require.cache[require.resolve("../tasks/agent-runner")];
    closeSharedJobDatabase(databasePath);
    process.env.ANTHROPIC_API_KEY = previousEnv.apiKey;
    process.env.ANTHROPIC_BASE_URL = previousEnv.baseUrl;
    process.env.WEB_TASK_AGENT_DB_PATH = previousEnv.databasePath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
