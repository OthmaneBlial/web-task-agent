import type { AgentSearchAdapter, AgentSearchStageResult } from "../search-adapter";

function isDuckDuckGoAdapter(adapter: AgentSearchAdapter): boolean {
  const haystack = `${adapter.id} ${adapter.label}`.toLowerCase();
  return haystack.includes("duckduckgo");
}

function isStructuredQuery(query: string): boolean {
  return (
    /\bsite:/i.test(query) ||
    /"[^\"]+"/.test(query) ||
    /\b[a-z0-9_]+(?:\.[a-z0-9_]+){2,}\b/i.test(query)
  );
}

function isDuckDuckGoChallengeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /duckduckgo challenge|bots use duckduckgo too|complete the following challenge/i.test(message);
}

export class ResilientSearchAdapter implements AgentSearchAdapter {
  readonly id: string;
  readonly label: string;
  private duckDuckGoCoolingDown = false;

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

  private orderAdaptersForQuery(query: string): AgentSearchAdapter[] {
    const adapters = [...this.adapters];

    if (!this.duckDuckGoCoolingDown && !isStructuredQuery(query)) {
      return adapters;
    }

    const preferred = adapters.filter((adapter) => !isDuckDuckGoAdapter(adapter));
    const deprioritized = adapters.filter((adapter) => isDuckDuckGoAdapter(adapter));
    return [...preferred, ...deprioritized];
  }

  buildSearchUrl(query: string): string {
    return this.orderAdaptersForQuery(query)[0]!.buildSearchUrl(query);
  }

  async search(query: string, maxResultsPerQuery: number): Promise<AgentSearchStageResult> {
    let lastError: unknown = null;
    const orderedAdapters = this.orderAdaptersForQuery(query);

    for (const [index, adapter] of orderedAdapters.entries()) {
      try {
        const result = await adapter.search(query, maxResultsPerQuery);
        if (index > 0) {
          this.log(`search fallback provider ${adapter.label} succeeded for "${query}"`);
        }
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (isDuckDuckGoAdapter(adapter) && isDuckDuckGoChallengeError(error) && !this.duckDuckGoCoolingDown) {
          this.duckDuckGoCoolingDown = true;
          this.log("duckduckgo challenge detected; preferring non-DuckDuckGo search providers for the rest of this run");
        }
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
