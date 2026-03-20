import type { AgentSearchResult } from "../../types";
import {
  DEFAULT_FETCH_BATCH_SIZE,
  MAX_ARTICLES_PER_QUERY,
} from "./shared";
import type { AgentFetcher } from "./fetcher";

export interface AgentFetchStageSummary {
  visitedResults: number;
  documentsCaptured: number;
  readResults: number;
  skippedResults: number;
  errorResults: number;
}

export function summarizeFetchedResults(results: AgentSearchResult[]): AgentFetchStageSummary {
  return {
    visitedResults: results.filter((result) => Boolean(result.page) || Boolean(result.reviewStatus)).length,
    documentsCaptured: results.filter((result) => Boolean(result.page)).length,
    readResults: results.filter((result) => result.reviewStatus === "read").length,
    skippedResults: results.filter((result) => result.reviewStatus === "skipped").length,
    errorResults: results.filter((result) => result.reviewStatus === "error").length
  };
}

export class AgentFetchStage {
  constructor(private readonly fetcher: AgentFetcher) {}

  get id(): string {
    return this.fetcher.id;
  }

  get label(): string {
    return this.fetcher.label;
  }

  async fetchResults(results: AgentSearchResult[]): Promise<AgentSearchResult[]> {
    return this.fetcher.fetchResults(results);
  }

  async fetchResultBatch(
    rawResults: AgentSearchResult[],
    startIndex: number,
    batchSize: number = DEFAULT_FETCH_BATCH_SIZE
  ): Promise<{
    results: AgentSearchResult[];
    startIndex: number;
    fetchedCount: number;
    remainingCount: number;
  }> {
    const safeStartIndex = Math.max(0, Math.min(startIndex, rawResults.length));
    const safeBatchSize = Math.max(1, batchSize);
    const slice = rawResults.slice(safeStartIndex, safeStartIndex + safeBatchSize);
    const enriched = await this.fetchResults(slice);
    const byUrl = new Map(enriched.map((entry) => [entry.url, entry]));
    const results = rawResults.map((entry) => byUrl.get(entry.url) ?? entry);
    const fetchedCount = slice.length;

    return {
      results,
      startIndex: safeStartIndex,
      fetchedCount,
      remainingCount: Math.max(0, rawResults.length - safeStartIndex - fetchedCount)
    };
  }

  async fetchTopResults(
    rawResults: AgentSearchResult[],
    maxArticlesPerQuery: number = MAX_ARTICLES_PER_QUERY
  ): Promise<AgentSearchResult[]> {
    return (
      await this.fetchResultBatch(
        rawResults,
        0,
        Math.min(maxArticlesPerQuery, rawResults.length)
      )
    ).results;
  }
}
