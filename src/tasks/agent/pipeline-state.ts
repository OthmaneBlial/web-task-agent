import type {
  AgentPipelineState,
  AgentPipelineStage,
  AgentPipelineWorkItem,
  AgentResearchResult,
  AgentSearchResult
} from "../../types";
import {
  countCapturedResearchDocuments,
  nowIso,
  rankSearchResultsForQuery
} from "./shared";

const AGENT_PIPELINE_VERSION = 2;

export function normalizeQueryKey(query: string): string {
  return query.trim().toLowerCase();
}

function buildEmptyWorkItem(query: string): AgentPipelineWorkItem {
  const timestamp = nowIso();
  return {
    query,
    queryKey: normalizeQueryKey(query),
    nextStage: "search",
    status: "pending",
    searchedAt: null,
    searchUrl: null,
    searchPagesVisited: 0,
    results: [],
    fetchCursor: 0,
    fetchBatchesCompleted: 0,
    rawPath: null,
    sourceCount: 0,
    documentCount: 0,
    extractionCount: 0,
    error: null,
    updatedAt: timestamp,
    completedAt: null
  };
}

function buildCompletedWorkItem(result: AgentResearchResult): AgentPipelineWorkItem {
  return {
    ...buildEmptyWorkItem(result.query),
    nextStage: "completed",
    status: "completed",
    searchedAt: result.searchedAt,
    results: result.results,
    fetchCursor: result.results.length,
    sourceCount: result.results.length,
    documentCount: countCapturedResearchDocuments([result]),
    error: result.error ?? null,
    completedAt: nowIso()
  };
}

function firstPendingFetchIndex(results: AgentSearchResult[]): number {
  const firstPendingIndex = results.findIndex(
    (result) => !result.page && !result.reviewStatus
  );
  return firstPendingIndex === -1 ? results.length : firstPendingIndex;
}

export function createPipelineState(): AgentPipelineState {
  return {
    version: AGENT_PIPELINE_VERSION,
    workItems: []
  };
}

export function ensurePipelineState(input: {
  pipeline?: AgentPipelineState | null;
  planQueries: string[];
  research: AgentResearchResult[];
}): AgentPipelineState {
  const existingItems = new Map<string, AgentPipelineWorkItem>();

  for (const item of input.pipeline?.workItems ?? []) {
    existingItems.set(item.queryKey, {
      ...buildEmptyWorkItem(item.query),
      ...item,
      queryKey: normalizeQueryKey(item.query),
      searchPagesVisited: item.searchPagesVisited ?? 0,
      fetchCursor:
        typeof item.fetchCursor === "number"
          ? item.fetchCursor
          : firstPendingFetchIndex(item.results ?? []),
      fetchBatchesCompleted: item.fetchBatchesCompleted ?? 0
    });
  }

  for (const result of input.research) {
    existingItems.set(normalizeQueryKey(result.query), buildCompletedWorkItem(result));
  }

  for (const query of input.planQueries) {
    const queryKey = normalizeQueryKey(query);
    if (!existingItems.has(queryKey)) {
      existingItems.set(queryKey, buildEmptyWorkItem(query));
    }
  }

  const orderedKeys = Array.from(
    new Set([
      ...input.planQueries.map((query) => normalizeQueryKey(query)),
      ...input.research.map((result) => normalizeQueryKey(result.query)),
      ...Array.from(existingItems.keys())
    ])
  );

  return {
    version: AGENT_PIPELINE_VERSION,
    workItems: orderedKeys
      .map((queryKey) => existingItems.get(queryKey))
      .filter((item): item is AgentPipelineWorkItem => Boolean(item))
  };
}

export function getPendingWorkItems(pipeline: AgentPipelineState): AgentPipelineWorkItem[] {
  return pipeline.workItems.filter((item) => item.nextStage !== "completed");
}

export function summarizePipelineQueue(pipeline: AgentPipelineState): {
  totalQueries: number;
  pendingQueries: number;
  runningQueries: number;
  completedQueries: number;
  failedQueries: number;
  nextSearchQueries: number;
  nextFetchQueries: number;
  nextExtractQueries: number;
} {
  return pipeline.workItems.reduce(
    (summary, item) => {
      summary.totalQueries += 1;
      summary.pendingQueries += item.status === "pending" ? 1 : 0;
      summary.runningQueries += item.status === "running" ? 1 : 0;
      summary.completedQueries += item.status === "completed" ? 1 : 0;
      summary.failedQueries += item.status === "failed" ? 1 : 0;
      summary.nextSearchQueries += item.nextStage === "search" ? 1 : 0;
      summary.nextFetchQueries += item.nextStage === "fetch" ? 1 : 0;
      summary.nextExtractQueries += item.nextStage === "extract" ? 1 : 0;
      return summary;
    },
    {
      totalQueries: 0,
      pendingQueries: 0,
      runningQueries: 0,
      completedQueries: 0,
      failedQueries: 0,
      nextSearchQueries: 0,
      nextFetchQueries: 0,
      nextExtractQueries: 0
    }
  );
}

export function markWorkItemStageRunning(
  item: AgentPipelineWorkItem,
  nextStage: Exclude<AgentPipelineStage, "completed">
): AgentPipelineWorkItem {
  return {
    ...item,
    nextStage,
    status: "running",
    updatedAt: nowIso()
  };
}

export function applySearchSuccess(
  item: AgentPipelineWorkItem,
  input: {
    searchedAt: string;
    searchUrl: string;
    pagesVisited?: number;
    results: AgentSearchResult[];
  }
): AgentPipelineWorkItem {
  const rankedResults = rankSearchResultsForQuery(input.results, item.query);
  const fetchCursor = firstPendingFetchIndex(rankedResults);
  return {
    ...item,
    searchedAt: input.searchedAt,
    searchUrl: input.searchUrl,
    searchPagesVisited: input.pagesVisited ?? item.searchPagesVisited,
    results: rankedResults,
    fetchCursor,
    nextStage: rankedResults.length > 0 && fetchCursor < rankedResults.length ? "fetch" : "extract",
    status: "pending",
    error: rankedResults.length > 0 ? null : "no search results were collected",
    updatedAt: nowIso()
  };
}

export function applySearchFailure(
  item: AgentPipelineWorkItem,
  input: {
    searchedAt: string;
    searchUrl: string;
    error: string;
  }
): AgentPipelineWorkItem {
  return {
    ...item,
    searchedAt: input.searchedAt,
    searchUrl: input.searchUrl,
    results: [],
    fetchCursor: 0,
    nextStage: "extract",
    status: "pending",
    error: input.error,
    updatedAt: nowIso()
  };
}

export function applyFetchSuccess(
  item: AgentPipelineWorkItem,
  input: {
    results: AgentSearchResult[];
    fetchedCount: number;
  }
): AgentPipelineWorkItem {
  const fetchCursor = firstPendingFetchIndex(input.results);
  const fetchBatchesCompleted =
    item.fetchBatchesCompleted + (input.fetchedCount > 0 ? 1 : 0);

  return {
    ...item,
    results: input.results,
    fetchCursor,
    fetchBatchesCompleted,
    nextStage: fetchCursor < input.results.length ? "fetch" : "extract",
    status: "pending",
    error: null,
    updatedAt: nowIso()
  };
}

export function applyFetchFailure(
  item: AgentPipelineWorkItem,
  error: string
): AgentPipelineWorkItem {
  return {
    ...item,
    fetchCursor: firstPendingFetchIndex(item.results),
    nextStage: "extract",
    status: "pending",
    error: `fetch stage failed: ${error}`,
    updatedAt: nowIso()
  };
}

export function buildResearchResultFromWorkItem(item: AgentPipelineWorkItem): AgentResearchResult {
  return {
    query: item.query,
    searchedAt: item.searchedAt ?? nowIso(),
    results: item.results,
    error: item.error ?? undefined
  };
}

export function applyExtractSuccess(
  item: AgentPipelineWorkItem,
  input: {
    rawPath: string;
    sourceCount: number;
    documentCount: number;
    extractionCount: number;
  }
): AgentPipelineWorkItem {
  const timestamp = nowIso();

  return {
    ...item,
    nextStage: "completed",
    status: "completed",
    rawPath: input.rawPath,
    sourceCount: input.sourceCount,
    documentCount: input.documentCount,
    extractionCount: input.extractionCount,
    fetchCursor: item.results.length,
    updatedAt: timestamp,
    completedAt: timestamp
  };
}

export function upsertWorkItem(
  pipeline: AgentPipelineState,
  workItem: AgentPipelineWorkItem
): AgentPipelineState {
  return {
    ...pipeline,
    workItems: pipeline.workItems.map((item) =>
      item.queryKey === workItem.queryKey ? workItem : item
    )
  };
}

export function upsertResearchResult(
  research: AgentResearchResult[],
  result: AgentResearchResult
): AgentResearchResult[] {
  const resultKey = normalizeQueryKey(result.query);
  const next = research.filter((entry) => normalizeQueryKey(entry.query) !== resultKey);
  next.push(result);
  return next;
}
