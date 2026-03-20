import type { AgentSearchResult } from "../../types";
import {
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

  async fetchTopResults(
    rawResults: AgentSearchResult[],
    maxArticlesPerQuery: number = MAX_ARTICLES_PER_QUERY
  ): Promise<AgentSearchResult[]> {
    const enriched = await this.fetchResults(
      rawResults.slice(0, Math.min(maxArticlesPerQuery, rawResults.length))
    );
    const byUrl = new Map(enriched.map((entry) => [entry.url, entry]));
    return rawResults.map((entry) => byUrl.get(entry.url) ?? entry);
  }
}
