import type { AgentSearchAdapter, AgentSearchStageResult } from "../search-adapter";

export class ResilientSearchAdapter implements AgentSearchAdapter {
  readonly id: string;
  readonly label: string;

  constructor(
    private readonly log: (message: string) => void,
    private readonly adapters: AgentSearchAdapter[]
  ) {
    if (adapters.length === 0) {
      throw new Error("resilient search adapter requires at least one provider");
    }
    this.id = adapters[0].id;
    this.label = adapters.map((adapter) => adapter.label).join(" -> ");
  }

  buildSearchUrl(query: string): string {
    return this.adapters[0].buildSearchUrl(query);
  }

  async search(query: string, maxResultsPerQuery: number): Promise<AgentSearchStageResult> {
    let lastError: unknown = null;

    for (const [index, adapter] of this.adapters.entries()) {
      try {
        const result = await adapter.search(query, maxResultsPerQuery);
        if (index > 0) {
          this.log(`search fallback provider ${adapter.label} succeeded for "${query}"`);
        }
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.log(`search provider ${adapter.label} failed for "${query}" (${message})`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "all search providers failed"));
  }
}

export function createResilientSearchAdapter(
  log: (message: string) => void,
  adapters: AgentSearchAdapter[]
): AgentSearchAdapter {
  return new ResilientSearchAdapter(log, adapters);
}
