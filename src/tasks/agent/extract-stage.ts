import path from "node:path";

import {
  ensureDir,
  writeJsonAtomic
} from "../../lib/cache";
import { JobStore } from "../../lib/job-store";
import type { AgentResearchResult } from "../../types";
import { slugify } from "./shared";
import type { AgentSearchAdapter } from "./search-adapter";

export interface AgentExtractStageResult {
  query: string;
  rawPath: string;
  sourceCount: number;
  documentCount: number;
  extractionCount: number;
}

interface PersistResearchMetadata {
  searchProvider?: string;
  searchUrl?: string | null;
}

export class AgentExtractStage {
  private readonly researchDir: string;

  constructor(
    private readonly jobStore: JobStore,
    artifactDir: string,
    private readonly searchAdapter: Pick<AgentSearchAdapter, "id" | "buildSearchUrl">
  ) {
    this.researchDir = path.join(artifactDir, "research");
    ensureDir(this.researchDir);
  }

  private resolvePersistMetadata(
    query: string,
    metadata?: PersistResearchMetadata
  ): { searchProvider: string; searchUrl: string | null } {
    return {
      searchProvider: metadata?.searchProvider ?? this.searchAdapter.id,
      searchUrl: metadata?.searchUrl ?? this.searchAdapter.buildSearchUrl(query)
    };
  }

  persistExistingResearch(
    research: AgentResearchResult[],
    resolveMetadata?: (query: string) => PersistResearchMetadata | undefined
  ): void {
    for (const result of research) {
      const metadata = this.resolvePersistMetadata(result.query, resolveMetadata?.(result.query));
      this.jobStore.persistAgentResearchResult(result, {
        searchProvider: metadata.searchProvider,
        searchUrl: metadata.searchUrl
      });
    }
  }

  persistQueryResult(
    result: AgentResearchResult,
    metadataInput?: PersistResearchMetadata
  ): AgentExtractStageResult {
    const rawPath = path.join(this.researchDir, `${slugify(result.query)}.json`);
    writeJsonAtomic(rawPath, result);
    this.jobStore.registerArtifact(`research_${slugify(result.query)}`, "research_json", rawPath, {
      query: result.query
    });
    const metadata = this.resolvePersistMetadata(result.query, metadataInput);

    const persisted = this.jobStore.persistAgentResearchResult(result, {
      searchProvider: metadata.searchProvider,
      searchUrl: metadata.searchUrl
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
