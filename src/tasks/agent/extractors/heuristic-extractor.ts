import {
  buildContentAwareExtractionCandidates,
  buildHeuristicExtractionCandidates
} from "../../../lib/extraction-heuristics";
import type {
  AgentExtractionCandidate,
  AgentSearchResult
} from "../../../types";
import type { AgentExtractor } from "../extractor";

export class HeuristicAgentExtractor implements AgentExtractor {
  readonly id = "heuristic_agent_extractor";
  readonly label = "Heuristic Agent Extractor";
  readonly origin = "heuristic";

  extractFromResult(result: AgentSearchResult): AgentExtractionCandidate[] {
    return buildHeuristicExtractionCandidates(result);
  }
}

export class SourceAwareAgentExtractor implements AgentExtractor {
  readonly id = "source_aware_agent_extractor";
  readonly label = "Source-Aware Agent Extractor";
  readonly origin = "best_effort";

  extractFromResult(result: AgentSearchResult): AgentExtractionCandidate[] {
    return buildContentAwareExtractionCandidates(result);
  }
}

export function createDefaultAgentExtractor(): AgentExtractor {
  return new SourceAwareAgentExtractor();
}
