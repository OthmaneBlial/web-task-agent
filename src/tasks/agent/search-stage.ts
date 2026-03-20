import type { AgentSearchAdapter, AgentSearchStageResult } from "./search-adapter";

export class AgentSearchStage {
  constructor(private readonly adapter: AgentSearchAdapter) {}

  get id(): string {
    return this.adapter.id;
  }

  get label(): string {
    return this.adapter.label;
  }

  buildSearchUrl(query: string): string {
    return this.adapter.buildSearchUrl(query);
  }

  async search(query: string, maxResultsPerQuery: number): Promise<AgentSearchStageResult> {
    return this.adapter.search(query, maxResultsPerQuery);
  }
}
