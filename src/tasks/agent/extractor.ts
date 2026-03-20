import type {
  AgentExtractionCandidate,
  AgentSearchResult
} from "../../types";

export interface AgentExtractor {
  readonly id: string;
  readonly label: string;
  extractFromResult(result: AgentSearchResult): AgentExtractionCandidate[];
}
