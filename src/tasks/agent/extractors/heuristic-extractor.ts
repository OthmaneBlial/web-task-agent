import { buildHeuristicExtractionCandidates } from "../../../lib/extraction-heuristics";
import type {
  AgentExtractionCandidate,
  AgentSearchResult
} from "../../../types";
import type { AgentExtractor } from "../extractor";

export class HeuristicAgentExtractor implements AgentExtractor {
  readonly id = "heuristic_agent_extractor";
  readonly label = "Heuristic Agent Extractor";

  extractFromResult(result: AgentSearchResult): AgentExtractionCandidate[] {
    return buildHeuristicExtractionCandidates(result);
  }
}

export function createDefaultAgentExtractor(): AgentExtractor {
  return new HeuristicAgentExtractor();
}
