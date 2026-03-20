import path from "node:path";

import {
  ensureDir,
  writeJsonAtomic
} from "../../lib/cache";
import { JobStore } from "../../lib/job-store";
import type { AgentResearchResult } from "../../types";
import {
  DUCKDUCKGO_SEARCH_PROVIDER,
  slugify
} from "./shared";

export interface AgentExtractStageResult {
  query: string;
  rawPath: string;
  sourceCount: number;
  documentCount: number;
  extractionCount: number;
}

export class AgentExtractStage {
  private readonly researchDir: string;

  constructor(
    private readonly jobStore: JobStore,
    artifactDir: string,
    private readonly buildSearchUrl: (query: string) => string,
    private readonly searchProvider: string = DUCKDUCKGO_SEARCH_PROVIDER
  ) {
    this.researchDir = path.join(artifactDir, "research");
    ensureDir(this.researchDir);
  }

  persistExistingResearch(research: AgentResearchResult[]): void {
    for (const result of research) {
      this.jobStore.persistAgentResearchResult(result, {
        searchProvider: this.searchProvider,
        searchUrl: this.buildSearchUrl(result.query)
      });
    }
  }

  persistQueryResult(result: AgentResearchResult): AgentExtractStageResult {
    const rawPath = path.join(this.researchDir, `${slugify(result.query)}.json`);
    writeJsonAtomic(rawPath, result);
    this.jobStore.registerArtifact(`research_${slugify(result.query)}`, "research_json", rawPath, {
      query: result.query
    });

    const persisted = this.jobStore.persistAgentResearchResult(result, {
      searchProvider: this.searchProvider,
      searchUrl: this.buildSearchUrl(result.query)
    });

    return {
      query: result.query,
      rawPath,
      sourceCount: persisted.sourceCount,
      documentCount: persisted.documentCount,
      extractionCount: persisted.extractionCount
    };
  }
}
