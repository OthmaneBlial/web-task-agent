import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  createOrResumeState,
  createRunId,
  ensureDir,
  saveTaskState,
  writeJsonAtomic
} from "../lib/cache";
import { ensureDebuggerReady } from "../lib/cdp";
import { loadAgentMemory } from "../lib/agent-memory";
import { JobStore } from "../lib/job-store";
import { LlmService } from "../lib/llm";
import type {
  AgentCommentsDraft,
  AgentEvidenceBundle,
  AgentPlan,
  AgentResearchResult,
  AgentRunOptions,
  AgentRunState,
  AgentStepKind,
  TaskJobInfo
} from "../types";
import { BaseTask } from "./BaseTask";
import { AgentExtractStage } from "./agent/extract-stage";
import { createDefaultAgentExtractor } from "./agent/extractors/heuristic-extractor";
import {
  AgentFetchStage,
  summarizeFetchedResults
} from "./agent/fetch-stage";
import { createDefaultAgentFetcher } from "./agent/fetchers/browser-fetcher";
import {
  applyExtractSuccess,
  applyFetchFailure,
  applyFetchSuccess,
  applySearchFailure,
  applySearchSuccess,
  buildResearchResultFromWorkItem,
  createPipelineState,
  ensurePipelineState,
  getPendingWorkItems,
  markWorkItemStageRunning,
  summarizePipelineQueue,
  upsertResearchResult,
  upsertWorkItem
} from "./agent/pipeline-state";
import { createDefaultAgentSearchAdapter } from "./agent/search-adapters/duckduckgo-html";
import { AgentSearchStage } from "./agent/search-stage";
import {
  AgentSynthesisStage,
  shouldGenerateResearchSummary
} from "./agent/synthesis-stage";
import {
  addHoursToIso,
  DEFAULT_AGENT_MAX_RUNTIME_HOURS,
  DEFAULT_FETCH_BATCH_SIZE,
  DEFAULT_JOB_HEARTBEAT_INTERVAL_SECONDS,
  DEFAULT_JOB_LEASE_TTL_SECONDS,
  MAX_AGENT_QUERIES,
  MAX_AGENT_RESULTS_PER_QUERY,
  MAX_FETCH_BATCH_SIZE,
  computeExecutionEstimateMinutes,
  countCapturedResearchDocuments,
  countCapturedResearchSources,
  nowIso
} from "./agent/shared";

interface AgentTaskResult extends TaskJobInfo {
  cachePath: string;
  reportPath: string;
  artifactDir: string;
  status: AgentRunState["status"];
  estimatedMinutes: number;
}

function defaultReportPath(runId: string): string {
  return path.join(process.cwd(), "reports", `agent-job-${runId}`, "report.md");
}

function updateStepStatus(
  plan: AgentPlan | null,
  kind: AgentStepKind,
  status: "pending" | "running" | "completed" | "failed" | "skipped"
): void {
  const step = plan?.steps.find((candidate) => candidate.kind === kind);
  if (step) {
    step.status = status;
  }
}

function appendNote(state: AgentRunState, message: string): void {
  state.notes.push(`[${nowIso()}] ${message}`);
}

function clampWholeNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function resolveMaxRuntimeHours(options: AgentRunOptions, state?: AgentRunState): number {
  return clampWholeNumber(
    options.maxRuntimeHours ?? state?.input.maxRuntimeHours ?? DEFAULT_AGENT_MAX_RUNTIME_HOURS,
    1,
    72
  );
}

function resolveLeaseTtlSeconds(options: AgentRunOptions, state?: AgentRunState): number {
  return clampWholeNumber(
    (options.leaseTtlMinutes ?? 0) * 60 || state?.runtime.leaseTtlSeconds || DEFAULT_JOB_LEASE_TTL_SECONDS,
    120,
    7_200
  );
}

function resolveFetchBatchSize(options: AgentRunOptions, state?: AgentRunState): number {
  return clampWholeNumber(
    options.fetchBatchSize ?? state?.input.fetchBatchSize ?? DEFAULT_FETCH_BATCH_SIZE,
    1,
    MAX_FETCH_BATCH_SIZE
  );
}

function resolveHeartbeatIntervalSeconds(leaseTtlSeconds: number, state?: AgentRunState): number {
  return clampWholeNumber(
    state?.runtime.heartbeatIntervalSeconds ??
      Math.min(DEFAULT_JOB_HEARTBEAT_INTERVAL_SECONDS, Math.max(30, Math.round(leaseTtlSeconds / 4))),
    15,
    Math.max(15, leaseTtlSeconds)
  );
}

function nextLeaseOwnerId(runId: string): string {
  return `agent-${runId}-${randomUUID().slice(0, 8)}`;
}

function normalizeRuntimeState(state: AgentRunState, options: AgentRunOptions): void {
  const maxRuntimeHours = resolveMaxRuntimeHours(options, state);
  const leaseTtlSeconds = resolveLeaseTtlSeconds(options, state);
  const fetchBatchSize = resolveFetchBatchSize(options, state);

  state.input.maxQueries = Math.max(0, Math.min(MAX_AGENT_QUERIES, state.input.maxQueries ?? options.maxQueries ?? 3));
  state.input.maxResultsPerQuery = Math.max(
    1,
    Math.min(MAX_AGENT_RESULTS_PER_QUERY, state.input.maxResultsPerQuery ?? options.maxResultsPerQuery ?? 5)
  );
  state.input.fetchBatchSize = fetchBatchSize;
  state.input.maxRuntimeHours = maxRuntimeHours;
  state.runtime = {
    leaseOwnerId: null,
    leaseTtlSeconds,
    heartbeatIntervalSeconds: resolveHeartbeatIntervalSeconds(leaseTtlSeconds, state),
    heartbeatAt: state.runtime?.heartbeatAt ?? null,
    recoveredAt: state.runtime?.recoveredAt ?? null,
    recoveryCount: state.runtime?.recoveryCount ?? 0,
    executionDeadlineAt:
      state.runtime?.executionDeadlineAt ??
      addHoursToIso(state.startedAt || nowIso(), maxRuntimeHours)
  };
}

function buildInitialState(options: AgentRunOptions): AgentRunState {
  const runId = createRunId();
  const reportPath = path.resolve(options.reportPath ?? defaultReportPath(runId));
  const artifactDir = path.dirname(reportPath);
  const maxRuntimeHours = resolveMaxRuntimeHours(options);
  const leaseTtlSeconds = resolveLeaseTtlSeconds(options);
  const fetchBatchSize = resolveFetchBatchSize(options);

  return {
    task: "agent",
    runId,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    status: "planning",
    input: {
      instruction: options.instruction,
      memoryPath: options.memoryPath ? path.resolve(options.memoryPath) : null,
      maxQueries: Math.max(0, Math.min(MAX_AGENT_QUERIES, options.maxQueries ?? 3)),
      maxResultsPerQuery: Math.max(1, Math.min(MAX_AGENT_RESULTS_PER_QUERY, options.maxResultsPerQuery ?? 5)),
      fetchBatchSize,
      maxRuntimeHours
    },
    runtime: {
      leaseOwnerId: null,
      leaseTtlSeconds,
      heartbeatIntervalSeconds: resolveHeartbeatIntervalSeconds(leaseTtlSeconds),
      heartbeatAt: null,
      recoveredAt: null,
      recoveryCount: 0,
      executionDeadlineAt: addHoursToIso(nowIso(), maxRuntimeHours)
    },
    reportPath,
    artifactDir,
    plan: null,
    pipeline: createPipelineState(),
    research: [],
    researchSummary: null,
    outputs: {
      planPath: null,
      pipelineManifestPath: path.join(artifactDir, "pipeline-manifest.json"),
      researchSummaryPath: null,
      postDraftPath: null,
      commentsDraftPath: null
    },
    notes: []
  };
}

function hasStep(plan: AgentPlan | null, kind: AgentStepKind): boolean {
  return Boolean(plan?.steps.some((step) => step.kind === kind));
}

export class AgentRunnerTask extends BaseTask<AgentRunOptions, AgentTaskResult> {
  private readonly llm = new LlmService();

  private writePipelineManifest(state: AgentRunState): void {
    if (!state.outputs.pipelineManifestPath) {
      return;
    }

    writeJsonAtomic(state.outputs.pipelineManifestPath, {
      runId: state.runId,
      status: state.status,
      updatedAt: state.updatedAt,
      summary: summarizePipelineQueue(state.pipeline),
      workItems: state.pipeline.workItems
    });
  }

  private saveState(cachePath: string, state: AgentRunState): void {
    state.updatedAt = nowIso();
    this.writePipelineManifest(state);
    saveTaskState("agent", cachePath, state);
  }

  private writeDraftFiles(
    state: AgentRunState,
    postDraft: { headline: string; body: string; callToAction: string } | null,
    commentsDraft: AgentCommentsDraft | null
  ): void {
    ensureDir(state.artifactDir);

    if (postDraft && !state.outputs.postDraftPath) {
      const postPath = path.join(state.artifactDir, "post-draft.md");
      const contents = [
        `# ${postDraft.headline}`,
        "",
        postDraft.body,
        "",
        `CTA: ${postDraft.callToAction}`
      ].join("\n");
      fs.writeFileSync(postPath, `${contents.trim()}\n`, "utf8");
      state.outputs.postDraftPath = postPath;
    }

    if (commentsDraft && !state.outputs.commentsDraftPath) {
      const commentsPath = path.join(state.artifactDir, "comments-draft.md");
      const lines = ["# Draft Comments", ""];
      commentsDraft.comments.forEach((comment, index) => {
        lines.push(`${index + 1}. ${comment}`);
      });
      fs.writeFileSync(commentsPath, `${lines.join("\n").trim()}\n`, "utf8");
      state.outputs.commentsDraftPath = commentsPath;
    }
  }

  private syncArtifacts(jobStore: JobStore, state: AgentRunState): void {
    if (state.outputs.planPath && fs.existsSync(state.outputs.planPath)) {
      jobStore.registerArtifact("plan", "json_plan", state.outputs.planPath, {
        kind: "plan"
      });
    }

    if (state.outputs.pipelineManifestPath && fs.existsSync(state.outputs.pipelineManifestPath)) {
      jobStore.registerArtifact(
        "pipeline_manifest",
        "json_pipeline_manifest",
        state.outputs.pipelineManifestPath,
        {
          kind: "pipeline_manifest"
        }
      );
    }

    if (state.outputs.researchSummaryPath && fs.existsSync(state.outputs.researchSummaryPath)) {
      jobStore.registerArtifact("research_summary", "markdown_summary", state.outputs.researchSummaryPath, {
        kind: "research_summary"
      });
    }

    if (state.outputs.postDraftPath && fs.existsSync(state.outputs.postDraftPath)) {
      jobStore.registerArtifact("post_draft", "markdown_draft", state.outputs.postDraftPath, {
        kind: "post_draft"
      });
    }

    if (state.outputs.commentsDraftPath && fs.existsSync(state.outputs.commentsDraftPath)) {
      jobStore.registerArtifact("comments_draft", "markdown_draft", state.outputs.commentsDraftPath, {
        kind: "comments_draft"
      });
    }

    if (fs.existsSync(state.reportPath)) {
      jobStore.registerArtifact("report", "markdown_report", state.reportPath, {
        kind: "report"
      });
    }
  }

  async run(): Promise<AgentTaskResult> {
    const { state, cachePath, resumed } = createOrResumeState<AgentRunState>({
      task: "agent",
      resume: this.options.resume,
      cachePath: this.options.cachePath,
      cacheDir: this.options.cacheDir,
      createInitialState: () => buildInitialState(this.options)
    });

    ensureDir(state.artifactDir);
    normalizeRuntimeState(state, this.options);
    state.pipeline = state.pipeline ?? createPipelineState();
    if (!state.outputs.pipelineManifestPath) {
      state.outputs.pipelineManifestPath = path.join(state.artifactDir, "pipeline-manifest.json");
    }

    const jobStore = new JobStore({
      jobId: state.runId,
      taskType: "agent",
      workflowName: "agent-runner",
      title: state.input.instruction.slice(0, 200),
      instruction: state.input.instruction,
      status: state.status === "failed" ? "planning" : state.status,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      cachePath,
      reportPath: state.reportPath,
      artifactDir: state.artifactDir,
      input: state.input,
      budget: {
        maxQueries: state.input.maxQueries,
        maxResultsPerQuery: state.input.maxResultsPerQuery,
        fetchBatchSize: state.input.fetchBatchSize,
        maxRuntimeHours: state.input.maxRuntimeHours,
        leaseTtlSeconds: state.runtime.leaseTtlSeconds
      },
      output: {
        researchQueriesCompleted: state.research.length
      }
    });
    jobStore.registerArtifact("cache", "cache_state", cachePath, {
      task: "agent"
    });
    this.syncArtifacts(jobStore, state);

    const searchAdapter = createDefaultAgentSearchAdapter((message) => this.log(message));
    const searchStage = new AgentSearchStage(searchAdapter);
    const fetcher = createDefaultAgentFetcher((message) => this.log(message));
    const fetchStage = new AgentFetchStage(fetcher);
    const extractor = createDefaultAgentExtractor();
    const extractStage = new AgentExtractStage(
      jobStore,
      state.artifactDir,
      searchAdapter,
      extractor
    );
    const synthesisStage = new AgentSynthesisStage(this.llm);

    const summarizeResearch = (): {
      researchQueriesCompleted: number;
      sourcesCaptured: number;
      documentsCaptured: number;
      researchErrors: number;
    } => ({
      researchQueriesCompleted: state.research.length,
      sourcesCaptured: countCapturedResearchSources(state.research),
      documentsCaptured: countCapturedResearchDocuments(state.research),
      researchErrors: state.research.filter((entry) => Boolean(entry.error)).length
    });

    const summarizePipeline = (): {
      searchedQueries: number;
      searchedSources: number;
      searchErrors: number;
      fetchedResults: number;
      fetchedDocuments: number;
      fetchErrors: number;
      extractedQueries: number;
      extractedSources: number;
      extractedDocuments: number;
      extractedExtractions: number;
    } => {
      const allResults = state.research.flatMap((entry) => entry.results);
      const fetchSummary = summarizeFetchedResults(allResults);
      const evidenceCounts = jobStore.getAgentEvidenceBundle().counts;
      const queueSummary = summarizePipelineQueue(state.pipeline);

      return {
        searchedQueries: state.pipeline.workItems.filter((item) => Boolean(item.searchedAt)).length,
        searchedSources: countCapturedResearchSources(state.research),
        searchErrors: state.pipeline.workItems.filter((item) => Boolean(item.error) && item.searchedAt).length,
        fetchedResults: fetchSummary.visitedResults,
        fetchedDocuments: fetchSummary.documentsCaptured,
        fetchErrors: fetchSummary.errorResults,
        extractedQueries: queueSummary.completedQueries,
        extractedSources: countCapturedResearchSources(state.research),
        extractedDocuments: countCapturedResearchDocuments(state.research),
        extractedExtractions: evidenceCounts.extractions
      };
    };

    const buildJobOutput = (): Record<string, unknown> => ({
      estimatedMinutes: state.plan?.estimatedMinutes ?? null,
      runtime: {
        leaseOwnerId: state.runtime.leaseOwnerId,
        heartbeatAt: state.runtime.heartbeatAt,
        recoveredAt: state.runtime.recoveredAt,
        recoveryCount: state.runtime.recoveryCount,
        executionDeadlineAt: state.runtime.executionDeadlineAt
      },
      ...summarizeResearch(),
      pipeline: {
        ...summarizePipeline(),
        queue: summarizePipelineQueue(state.pipeline)
      }
    });

    let evidenceBundle: AgentEvidenceBundle | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    const planStep = {
      stepKey: "plan_job",
      title: "Plan the job",
      kind: "plan",
      position: 1,
      input: {
        instruction: state.input.instruction,
        maxQueries: state.input.maxQueries
      }
    };
    const searchStep = {
      stepKey: "search_sources",
      title: "Search sources",
      kind: "search",
      position: 2,
      input: {
        maxQueries: state.input.maxQueries,
        maxResultsPerQuery: state.input.maxResultsPerQuery
      }
    };
    const fetchStep = {
      stepKey: "fetch_documents",
      title: "Fetch result pages",
      kind: "fetch",
      position: 3,
      input: {
        maxArticlesPerQuery: state.input.maxResultsPerQuery,
        fetchBatchSize: state.input.fetchBatchSize
      }
    };
    const extractStep = {
      stepKey: "extract_evidence",
      title: "Persist documents and extract evidence",
      kind: "extract",
      position: 4
    };
    const summaryStep = {
      stepKey: "synthesize_research",
      title: "Synthesize research findings",
      kind: "analyze",
      position: 5
    };
    const postDraftStep = {
      stepKey: "draft_post",
      title: "Draft post",
      kind: "draft_post",
      position: 6
    };
    const commentsDraftStep = {
      stepKey: "draft_comments",
      title: "Draft comments",
      kind: "draft_comments",
      position: 7
    };
    const reviewStep = {
      stepKey: "review",
      title: "Wait for human review",
      kind: "review",
      position: 8
    };
    const reportStep = {
      stepKey: "write_report",
      title: "Write final report",
      kind: "report",
      position: 9,
      input: {
        reportPath: state.reportPath
      }
    };

    this.log(
      resumed
        ? `resuming agent run from ${cachePath}`
        : `starting agent run for: ${state.input.instruction}`
    );

    await ensureDebuggerReady();
    this.log("attached to Lightpanda CDP server");

    const memory = loadAgentMemory(this.options.memoryPath ?? state.input.memoryPath ?? undefined);
    if (memory && state.input.memoryPath !== memory.path) {
      state.input.memoryPath = memory.path;
      jobStore.syncJob({
        input: state.input
      });
    }

    try {
      state.runtime.leaseOwnerId = nextLeaseOwnerId(state.runId);
      const acquiredLease = jobStore.acquireLease({
        ownerId: state.runtime.leaseOwnerId,
        ttlSeconds: state.runtime.leaseTtlSeconds,
        recoveryReason: resumed
          ? "resumed cached run after interruption"
          : "continued after interrupted execution"
      });
      state.runtime.heartbeatAt = acquiredLease.lease.heartbeatAt;
      state.runtime.recoveryCount = acquiredLease.lease.recoveryCount;
      if (acquiredLease.recovered) {
        state.runtime.recoveredAt = acquiredLease.lease.lastRecoveredAt ?? acquiredLease.lease.acquiredAt;
        appendNote(
          state,
          `Recovered stale execution lease from ${acquiredLease.previousOwnerId ?? "unknown worker"}.`
        );
      }
      this.saveState(cachePath, state);
      jobStore.syncJob({
        updatedAt: state.updatedAt,
        budget: {
          maxQueries: state.input.maxQueries,
          maxResultsPerQuery: state.input.maxResultsPerQuery,
          fetchBatchSize: state.input.fetchBatchSize,
          maxRuntimeHours: state.input.maxRuntimeHours,
          leaseTtlSeconds: state.runtime.leaseTtlSeconds
        },
        output: buildJobOutput()
      });
      heartbeatTimer = setInterval(() => {
        try {
          const lease = jobStore.heartbeat({
            ttlSeconds: state.runtime.leaseTtlSeconds,
            output: buildJobOutput()
          });
          state.runtime.heartbeatAt = lease.heartbeatAt;
        } catch (error) {
          this.log(
            `job heartbeat warning: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }, state.runtime.heartbeatIntervalSeconds * 1000);
      heartbeatTimer.unref?.();

      if (!state.plan) {
        state.status = "planning";
        appendNote(state, "Planning the job.");
        this.saveState(cachePath, state);
        jobStore.syncJob({
          status: "planning",
          updatedAt: state.updatedAt,
          input: state.input
        });
        jobStore.startStep(planStep);

        try {
          state.plan = await this.llm.planAgentJob({
            instruction: state.input.instruction,
            memory: memory?.content,
            maxQueries: state.input.maxQueries
          });
          state.plan.estimatedMinutes = computeExecutionEstimateMinutes(
            state.plan,
            state.input.maxResultsPerQuery
          );
          state.outputs.planPath = path.join(state.artifactDir, "plan.json");
          writeJsonAtomic(state.outputs.planPath, state.plan);
          this.syncArtifacts(jobStore, state);
          appendNote(
            state,
            `Plan created with ${state.plan.steps.length} steps and a ${state.plan.estimatedMinutes} minute execution estimate.`
          );
          this.saveState(cachePath, state);
          jobStore.completeStep(planStep, {
            estimatedMinutes: state.plan.estimatedMinutes,
            deliverables: state.plan.deliverables.length,
            researchQueries: state.plan.researchQueries.length,
            planPath: state.outputs.planPath
          });
          jobStore.syncJob({
            status: "planning",
            updatedAt: state.updatedAt,
            output: {
              estimatedMinutes: state.plan.estimatedMinutes,
              planSteps: state.plan.steps.length
            }
          });
        } catch (error) {
          jobStore.failStep(planStep, error);
          throw error;
        }
      } else {
        jobStore.completeStep(planStep, {
          reused: true,
          estimatedMinutes: state.plan.estimatedMinutes,
          planPath: state.outputs.planPath
        });
        this.syncArtifacts(jobStore, state);
      }

      if (!state.plan) {
        throw new Error("agent plan is missing after planning");
      }

      state.pipeline = ensurePipelineState({
        pipeline: state.pipeline,
        planQueries: state.plan.researchQueries,
        research: state.research
      });
      this.saveState(cachePath, state);
      this.syncArtifacts(jobStore, state);

      const executionEstimate = computeExecutionEstimateMinutes(
        state.plan,
        state.input.maxResultsPerQuery
      );
      if (state.plan.estimatedMinutes !== executionEstimate) {
        state.plan.estimatedMinutes = executionEstimate;
        appendNote(
          state,
          `Execution estimate recalculated from browsing policy: ${executionEstimate} minutes.`
        );
        this.saveState(cachePath, state);
        if (state.outputs.planPath) {
          writeJsonAtomic(state.outputs.planPath, state.plan);
          this.syncArtifacts(jobStore, state);
        }
      }

      if (state.plan.researchQueries.length > 0) {
        state.status = "running";
        updateStepStatus(state.plan, "research", "running");
        this.saveState(cachePath, state);
        jobStore.syncJob({
          status: "running",
          updatedAt: state.updatedAt,
          output: buildJobOutput()
        });

        extractStage.persistExistingResearch(state.research);

        const pendingWorkItems = getPendingWorkItems(state.pipeline);

        if (pendingWorkItems.length > 0) {
          for (const seedWorkItem of pendingWorkItems) {
            let workItem = seedWorkItem;
            this.log(`researching: ${workItem.query}`);

            while (workItem.nextStage !== "completed") {
              if (workItem.nextStage === "search") {
                workItem = markWorkItemStageRunning(workItem, "search");
                state.pipeline = upsertWorkItem(state.pipeline, workItem);
                this.saveState(cachePath, state);

                try {
                  const searchResult = await jobStore.runStep(
                    searchStep,
                    async () => searchStage.search(workItem.query, state.input.maxResultsPerQuery),
                    {
                      output: (result) => ({
                        lastQuery: result.query,
                        searchedAt: result.searchedAt,
                        searchUrl: result.searchUrl,
                        pagesVisited: result.pagesVisited,
                        resultCount: result.results.length
                      })
                    }
                  );

                  workItem = applySearchSuccess(workItem, searchResult);
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  workItem = applySearchFailure(workItem, {
                    searchedAt: nowIso(),
                    searchUrl: searchStage.buildSearchUrl(workItem.query),
                    error: errorMessage
                  });
                }

                state.pipeline = upsertWorkItem(state.pipeline, workItem);
                this.saveState(cachePath, state);
                continue;
              }

              if (workItem.nextStage === "fetch") {
                workItem = markWorkItemStageRunning(workItem, "fetch");
                state.pipeline = upsertWorkItem(state.pipeline, workItem);
                this.saveState(cachePath, state);

                try {
                  const fetchedBatch = await jobStore.runStep(
                    fetchStep,
                    async () =>
                      fetchStage.fetchResultBatch(
                        workItem.results,
                        workItem.fetchCursor,
                        state.input.fetchBatchSize
                      ),
                    {
                      output: (result) => ({
                        startIndex: result.startIndex,
                        fetchedCount: result.fetchedCount,
                        remainingCount: result.remainingCount,
                        ...summarizeFetchedResults(
                          result.results.slice(
                            result.startIndex,
                            result.startIndex + result.fetchedCount
                          )
                        )
                      })
                    }
                  );

                  workItem = applyFetchSuccess(workItem, {
                    results: fetchedBatch.results,
                    fetchedCount: fetchedBatch.fetchedCount
                  });
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  workItem = applyFetchFailure(workItem, errorMessage);
                }

                state.pipeline = upsertWorkItem(state.pipeline, workItem);
                this.saveState(cachePath, state);
                jobStore.syncJob({
                  status: "running",
                  updatedAt: state.updatedAt,
                  output: buildJobOutput()
                });
                continue;
              }

              workItem = markWorkItemStageRunning(workItem, "extract");
              state.pipeline = upsertWorkItem(state.pipeline, workItem);
              this.saveState(cachePath, state);

              const researchResult = buildResearchResultFromWorkItem(workItem);
              const persisted = await jobStore.runStep(
                extractStep,
                async () => extractStage.persistQueryResult(researchResult),
                {
                  output: (result) => ({
                    lastQuery: result.query,
                    rawPath: result.rawPath,
                    sourceCount: result.sourceCount,
                    documentCount: result.documentCount,
                    extractionCount: result.extractionCount
                  })
                }
              );

              workItem = applyExtractSuccess(workItem, persisted);
              state.pipeline = upsertWorkItem(state.pipeline, workItem);
              state.research = upsertResearchResult(state.research, researchResult);
              appendNote(
                state,
                researchResult.error
                  ? `Research query failed: ${workItem.query} (${researchResult.error})`
                  : `Research query captured ${persisted.sourceCount} sources and ${persisted.documentCount} documents: ${workItem.query}`
              );
              this.saveState(cachePath, state);
              jobStore.syncJob({
                status: "running",
                updatedAt: state.updatedAt,
                output: buildJobOutput()
              });
            }
          }

          const pipelineSummary = summarizePipeline();
          jobStore.completeStep(searchStep, {
            queries: pipelineSummary.searchedQueries,
            sources: pipelineSummary.searchedSources,
            errors: pipelineSummary.searchErrors
          });
          jobStore.completeStep(fetchStep, {
            visitedResults: pipelineSummary.fetchedResults,
            documentsCaptured: pipelineSummary.fetchedDocuments,
            errorResults: pipelineSummary.fetchErrors
          });
          jobStore.completeStep(extractStep, {
            queries: pipelineSummary.extractedQueries,
            sources: pipelineSummary.extractedSources,
            documents: pipelineSummary.extractedDocuments,
            extractions: pipelineSummary.extractedExtractions
          });
        } else {
          const pipelineSummary = summarizePipeline();
          jobStore.completeStep(searchStep, {
            reused: true,
            queries: pipelineSummary.searchedQueries,
            sources: pipelineSummary.searchedSources,
            errors: pipelineSummary.searchErrors
          });
          jobStore.completeStep(fetchStep, {
            reused: true,
            visitedResults: pipelineSummary.fetchedResults,
            documentsCaptured: pipelineSummary.fetchedDocuments,
            errorResults: pipelineSummary.fetchErrors
          });
          jobStore.completeStep(extractStep, {
            reused: true,
            queries: pipelineSummary.extractedQueries,
            sources: pipelineSummary.extractedSources,
            documents: pipelineSummary.extractedDocuments,
            extractions: pipelineSummary.extractedExtractions
          });
        }

        evidenceBundle = jobStore.getAgentEvidenceBundle();
        updateStepStatus(state.plan, "research", "completed");
        this.saveState(cachePath, state);
      } else {
        updateStepStatus(state.plan, "research", "skipped");
        state.pipeline = ensurePipelineState({
          pipeline: state.pipeline,
          planQueries: [],
          research: state.research
        });
        jobStore.markSkipped(searchStep, {
          reason: "no research queries planned"
        });
        jobStore.markSkipped(fetchStep, {
          reason: "no research queries planned"
        });
        jobStore.markSkipped(extractStep, {
          reason: "no research queries planned"
        });
        evidenceBundle = jobStore.getAgentEvidenceBundle();
      }

      evidenceBundle = evidenceBundle ?? jobStore.getAgentEvidenceBundle();

      if (evidenceBundle.counts.sources > 0) {
        if (shouldGenerateResearchSummary(state.researchSummary, evidenceBundle)) {
          state.status = "running";
          const summary = await jobStore.runStep(
            summaryStep,
            async () =>
              synthesisStage.synthesizePersistedResearch({
                instruction: state.input.instruction,
                evidence: evidenceBundle!
              }),
            {
              output: (result) => ({
                keyFindings: result.keyFindings.length,
                contentAngles: result.contentAngles.length,
                evidenceSources: evidenceBundle!.counts.sources,
                evidenceExtractions: evidenceBundle!.counts.extractions,
                referencedEvidence: result.referencedEvidence.length
              })
            }
          );

          state.researchSummary = summary;
          synthesisStage.writeResearchSummaryArtifact(state, summary, evidenceBundle);
          this.syncArtifacts(jobStore, state);
          appendNote(state, "Research summary generated.");
          this.saveState(cachePath, state);
          jobStore.completeStep(summaryStep, {
            keyFindings: summary.keyFindings.length,
            contentAngles: summary.contentAngles.length,
            evidenceSources: evidenceBundle.counts.sources,
            evidenceExtractions: evidenceBundle.counts.extractions,
            referencedEvidence: summary.referencedEvidence.length,
            researchSummaryPath: state.outputs.researchSummaryPath
          });
        } else {
          const existingSummary = state.researchSummary!;
          jobStore.completeStep(summaryStep, {
            reused: true,
            keyFindings: existingSummary.keyFindings.length,
            contentAngles: existingSummary.contentAngles.length,
            evidenceSources: evidenceBundle.counts.sources,
            evidenceExtractions: evidenceBundle.counts.extractions,
            referencedEvidence: (existingSummary.referencedEvidence ?? []).length,
            researchSummaryPath: state.outputs.researchSummaryPath
          });
        }
      } else {
        jobStore.markSkipped(summaryStep, {
          reason: "no persisted evidence was collected"
        });
      }

      let postDraft: { headline: string; body: string; callToAction: string } | null = null;
      let commentsDraft: AgentCommentsDraft | null = null;

      if (hasStep(state.plan, "draft_post")) {
        if (!state.outputs.postDraftPath) {
          state.status = "running";
          updateStepStatus(state.plan, "draft_post", "running");
          this.saveState(cachePath, state);
          postDraft = await jobStore.runStep(
            postDraftStep,
            async () =>
              this.llm.draftAgentPost({
                instruction: state.input.instruction,
                plan: state.plan!,
                researchSummary: state.researchSummary,
                memory: memory?.content
              }),
            {
              output: (result) => ({
                headline: result.headline
              })
            }
          );
          updateStepStatus(state.plan, "draft_post", "completed");
          appendNote(state, "Draft post generated.");
          this.saveState(cachePath, state);
        } else {
          jobStore.completeStep(postDraftStep, {
            reused: true,
            postDraftPath: state.outputs.postDraftPath
          });
        }
      } else {
        jobStore.markSkipped(postDraftStep, {
          reason: "post draft not requested by the plan"
        });
      }

      if (hasStep(state.plan, "draft_comments")) {
        if (!state.outputs.commentsDraftPath) {
          state.status = "running";
          updateStepStatus(state.plan, "draft_comments", "running");
          this.saveState(cachePath, state);
          commentsDraft = await jobStore.runStep(
            commentsDraftStep,
            async () =>
              this.llm.draftAgentComments({
                instruction: state.input.instruction,
                plan: state.plan!,
                researchSummary: state.researchSummary,
                memory: memory?.content,
                count: 5
              }),
            {
              output: (result) => ({
                commentsCount: result.comments.length
              })
            }
          );
          updateStepStatus(state.plan, "draft_comments", "completed");
          appendNote(state, "Draft comments generated.");
          this.saveState(cachePath, state);
        } else {
          jobStore.completeStep(commentsDraftStep, {
            reused: true,
            commentsDraftPath: state.outputs.commentsDraftPath
          });
        }
      } else {
        jobStore.markSkipped(commentsDraftStep, {
          reason: "comment drafts not requested by the plan"
        });
      }

      this.writeDraftFiles(state, postDraft, commentsDraft);
      this.syncArtifacts(jobStore, state);
      if (hasStep(state.plan, "draft_post") && state.outputs.postDraftPath) {
        jobStore.completeStep(postDraftStep, {
          headline: postDraft?.headline ?? null,
          postDraftPath: state.outputs.postDraftPath
        });
      }
      if (hasStep(state.plan, "draft_comments") && state.outputs.commentsDraftPath) {
        jobStore.completeStep(commentsDraftStep, {
          commentsCount: commentsDraft?.comments.length ?? null,
          commentsDraftPath: state.outputs.commentsDraftPath
        });
      }

      updateStepStatus(state.plan, "report", "running");
      this.saveState(cachePath, state);

      const hasDrafts = Boolean(state.outputs.postDraftPath || state.outputs.commentsDraftPath);
      state.status = state.plan.approvalRequired || hasDrafts ? "waiting_review" : "completed";
      if (hasStep(state.plan, "review")) {
        updateStepStatus(state.plan, "review", state.status === "waiting_review" ? "pending" : "completed");
      }
      appendNote(
        state,
        state.status === "waiting_review"
          ? "Drafts are ready and waiting for review."
          : "Job completed."
      );

      await jobStore.runStep(
        reportStep,
        async () => ({
          reportPath: synthesisStage.writeReportArtifact(state, jobStore)
        }),
        {
          output: (result) => result
        }
      );
      updateStepStatus(state.plan, "report", "completed");
      this.syncArtifacts(jobStore, state);

      if (hasStep(state.plan, "review")) {
        if (state.status === "waiting_review") {
          jobStore.markPending(reviewStep, {
            reason: "waiting for human review"
          });
        } else {
          jobStore.completeStep(reviewStep, {
            reason: "review step completed during the same run"
          });
        }
      } else {
        jobStore.markSkipped(reviewStep, {
          reason: "no review step in the plan"
        });
      }

      this.saveState(cachePath, state);
      jobStore.setStatus(state.status, {
        output: {
          ...buildJobOutput(),
          hasPostDraft: Boolean(state.outputs.postDraftPath),
          hasCommentsDraft: Boolean(state.outputs.commentsDraftPath),
          reportPath: state.reportPath
        },
        completedAt: state.status === "completed" ? state.updatedAt : null
      });

      return {
        jobId: state.runId,
        databasePath: jobStore.databasePath,
        cachePath,
        reportPath: state.reportPath,
        artifactDir: state.artifactDir,
        status: state.status,
        estimatedMinutes: state.plan.estimatedMinutes
      };
    } catch (error) {
      state.status = "failed";
      updateStepStatus(state.plan, "report", "failed");
      appendNote(
        state,
        `Run failed: ${error instanceof Error ? error.message : String(error)}`
      );
      this.saveState(cachePath, state);
      jobStore.setStatus("failed", {
        output: {
          ...buildJobOutput(),
          hasPostDraft: Boolean(state.outputs.postDraftPath),
          hasCommentsDraft: Boolean(state.outputs.commentsDraftPath)
        },
        errorMessage: error instanceof Error ? error.stack ?? error.message : String(error),
        completedAt: state.updatedAt
      });
      throw error;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      try {
        jobStore.releaseLease();
      } catch (error) {
        this.log(
          `job lease release warning: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}
