import path from "node:path";

import {
  ensureDir,
  writeJsonAtomic
} from "../../lib/cache";
import { JobStore } from "../../lib/job-store";
import type { AgentResearchResult } from "../../types";
import type { AgentExtractor } from "./extractor";
import { slugify } from "./shared";
import type { AgentSearchAdapter } from "./search-adapter";

export interface AgentExtractStageResult {
  query: string;
  rawPath: string;
  sourceCount: number;
  documentCount: number;
  extractionCount: number;
  snapshotCount: number;
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
    private readonly searchAdapter: Pick<AgentSearchAdapter, "id" | "buildSearchUrl">,
    private readonly extractor: Pick<AgentExtractor, "id" | "origin" | "extractFromResult">
  ) {
    this.researchDir = path.join(artifactDir, "raw", "research");
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
        searchUrl: metadata.searchUrl,
        extractorId: this.extractor.id,
        extractorOrigin: this.extractor.origin,
        getExtractionCandidates: (searchResult) => this.extractor.extractFromResult(searchResult)
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
      searchUrl: metadata.searchUrl,
      extractorId: this.extractor.id,
      extractorOrigin: this.extractor.origin,
      getExtractionCandidates: (searchResult) => this.extractor.extractFromResult(searchResult)
    });

    return {
      query: result.query,
      rawPath,
      sourceCount: persisted.sourceCount,
      documentCount: persisted.documentCount,
      extractionCount: persisted.extractionCount,
      snapshotCount: persisted.snapshotCount
    };
  }
}
