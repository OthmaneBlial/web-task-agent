import type {
  AgentExtractionCandidate,
  AgentSearchResult
} from "../../types";
import type { AgentExtractionOrigin } from "../../types";

export interface AgentExtractor {
  readonly id: string;
  readonly label: string;
  readonly origin: AgentExtractionOrigin;
  extractFromResult(result: AgentSearchResult): AgentExtractionCandidate[];
}
