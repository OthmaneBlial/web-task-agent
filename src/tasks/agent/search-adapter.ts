import type { AgentSearchResult } from "../../types";

export interface AgentSearchStageResult {
  query: string;
  searchedAt: string;
  searchUrl: string;
  searchProvider: string;
  pagesVisited: number;
  exhausted: boolean;
  results: AgentSearchResult[];
}

export interface AgentSearchAdapter {
  readonly id: string;
  readonly label: string;
  buildSearchUrl(query: string): string;
  search(query: string, maxResultsPerQuery: number): Promise<AgentSearchStageResult>;
}
