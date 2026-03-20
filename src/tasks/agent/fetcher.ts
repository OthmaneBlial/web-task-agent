import type { AgentSearchResult } from "../../types";

export interface AgentFetcher {
  readonly id: string;
  readonly label: string;
  fetchResults(results: AgentSearchResult[]): Promise<AgentSearchResult[]>;
}
