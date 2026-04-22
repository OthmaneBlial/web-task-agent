import type {
  AgentExtractionCandidate,
  AgentSearchResult
} from "../types";
import type { AgentExtractionOrigin } from "../types";
import { classifyResearchContentType } from "../tasks/agent/shared";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildDigestText(result: AgentSearchResult): string {
  const page = result.page;
  if (!page) {
    return normalizeText([result.title, result.snippet].join("\n"));
  }

  return [
    page.title,
    page.description,
    page.h1 ?? "",
    ...page.headings,
    ...page.paragraphs
  ]
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeText(sentence))
    .filter((sentence) => sentence.length >= 20);
}

function normalizeExtractionValue(value: string): string {
  return normalizeText(value).toLowerCase();
}

const BOILERPLATE_THEME_VALUES = new Set([
  "introduction",
  "conclusion",
  "top posts",
  "view post in",
  "comparison table",
  "quick comparison",
  "key takeaways",
  "older posts",
  "related posts",
  "major ai breakthroughs",
  "practical applications",
  "request discussion guidelines",
  "welcome to the r/artificialintelligence gateway"
]);

function isBoilerplateTheme(value: string): boolean {
  const normalized = normalizeExtractionValue(value);
  if (!normalized) {
    return true;
  }

  if (BOILERPLATE_THEME_VALUES.has(normalized)) {
    return true;
  }

  if (
    normalized.startsWith("view post in") ||
    normalized.startsWith("top posts") ||
    normalized.startsWith("related posts") ||
    normalized.startsWith("older posts") ||
    normalized.startsWith("welcome to")
  ) {
    return true;
  }

  if (/^\d+[\).\s:-]+[a-z0-9].{0,40}$/i.test(normalized)) {
    return true;
  }

  return false;
}

export function selectUniqueExtractions(
  candidates: AgentExtractionCandidate[],
  limitPerKind: number = 8
): AgentExtractionCandidate[] {
  const seen = new Set<string>();
  const counts = new Map<AgentExtractionCandidate["kind"], number>();
  const selected: AgentExtractionCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedValue = normalizeExtractionValue(candidate.value);
    if (!normalizedValue) {
      continue;
    }

    if (candidate.kind === "theme" && isBoilerplateTheme(normalizedValue)) {
      continue;
    }

    const count = counts.get(candidate.kind) ?? 0;
    if (count >= limitPerKind) {
      continue;
    }

    const key = `${candidate.kind}:${normalizedValue}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    counts.set(candidate.kind, count + 1);
    selected.push(candidate);
  }

  return selected;
}

function extractCandidateEntities(text: string): string[] {
  const matches =
    text.match(/\b(?:[A-Z][a-z0-9]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z0-9]+|[A-Z]{2,})){0,3}\b/g) ?? [];
  const blocked = new Set([
    "The",
    "This",
    "That",
    "These",
    "Those",
    "And",
    "But",
    "For",
    "With",
    "From",
    "Into",
    "About"
  ]);

  return matches
    .map((match) => normalizeText(match))
    .filter((match) => match.length >= 3 && match.length <= 80)
    .filter((match) => !blocked.has(match))
    .slice(0, 12);
}

function extractThemePhrases(result: AgentSearchResult): string[] {
  const candidates = [result.page?.h1 ?? "", result.title, ...(result.page?.headings ?? [])];

  return candidates
    .map((value) => normalizeText(value))
    .filter((value) => !isBoilerplateTheme(value))
    .filter((value) => value.length >= 6 && value.length <= 90)
    .slice(0, 10);
}

function extractSentencesByTerms(sentences: string[], terms: string[]): string[] {
  return sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });
}

function sentencePool(result: AgentSearchResult): string[] {
  return splitSentences(
    [result.snippet, result.page?.description ?? "", ...(result.page?.paragraphs ?? [])]
      .filter(Boolean)
      .join(" ")
  );
}

function titleText(result: AgentSearchResult): string {
  return normalizeText(
    [result.title, result.page?.title ?? "", result.page?.h1 ?? ""].filter(Boolean).join(" ")
  );
}

interface ExtractionGateDecision {
  allow: boolean;
  reason: string;
  signals: string[];
}

function evaluateExtractionGate(result: AgentSearchResult): ExtractionGateDecision {
  const signals: string[] = [];

  if (!result.page) {
    return {
      allow: false,
      reason: "missing page digest",
      signals: ["page digest unavailable"]
    };
  }

  const qualityScore = result.qualityScore ?? 0;
  if (qualityScore > 0 && qualityScore < 0.5) {
    return {
      allow: false,
      reason: "quality score below extraction threshold",
      signals: [`quality score ${qualityScore.toFixed(2)} below 0.50`]
    };
  }

  const combinedText = buildDigestText(result);
  const sentenceCount = splitSentences(combinedText).length;
  if (combinedText.length < 160 || sentenceCount < 2) {
    return {
      allow: false,
      reason: "page body is too thin for extraction",
      signals: [
        `content length ${combinedText.length} chars`,
        `${sentenceCount} readable sentences`
      ]
    };
  }

  const pageHeadingCount = result.page.headings.length;
  if (pageHeadingCount > 0) {
    signals.push(`${pageHeadingCount} headings available`);
  }

  if (qualityScore > 0) {
    signals.push(`quality score ${qualityScore.toFixed(2)}`);
  }

  if (result.reviewStatus) {
    signals.push(`review status ${result.reviewStatus}`);
  }

  return {
    allow: true,
    reason: "page has enough readable content",
    signals
  };
}

function pushEntitiesAndThemes(
  candidates: AgentExtractionCandidate[],
  result: AgentSearchResult,
  methodPrefix: string,
  themeConfidence: number,
  origin: AgentExtractionOrigin,
  metadata?: Record<string, unknown>
): void {
  const titleValue = titleText(result);

  for (const entity of extractCandidateEntities(titleValue)) {
    candidates.push({
      kind: "entity",
      value: entity,
      evidenceText: titleValue,
      confidence: 0.72,
      method: `${methodPrefix}_entity`,
      origin,
      metadata: {
        ...metadata,
        source: "title"
      }
    });
  }

  for (const theme of extractThemePhrases(result)) {
    candidates.push({
      kind: "theme",
      value: theme,
      evidenceText: theme,
      confidence: themeConfidence,
      method: `${methodPrefix}_theme`,
      origin,
      metadata: {
        ...metadata,
        source: "headings"
      }
    });
  }
}

function pushSentenceCandidates(
  candidates: AgentExtractionCandidate[],
  kind: AgentExtractionCandidate["kind"],
  sentences: string[],
  terms: string[],
  confidence: number,
  method: string,
  origin: AgentExtractionOrigin,
  metadata?: Record<string, unknown>
): void {
  for (const sentence of extractSentencesByTerms(sentences, terms)) {
    candidates.push({
      kind,
      value: sentence,
      evidenceText: sentence,
      confidence,
      method,
      origin,
      metadata
    });
  }
}

export function shouldExtractFromResult(result: AgentSearchResult): boolean {
  return evaluateExtractionGate(result).allow;
}

export function buildHeuristicExtractionCandidates(
  result: AgentSearchResult
): AgentExtractionCandidate[] {
  if (!shouldExtractFromResult(result)) {
    return [];
  }

  const combinedText = buildDigestText(result);
  const sentences = sentencePool(result);
  const claimSentences = sentences.length > 0 ? sentences : splitSentences(combinedText);
  const gate = evaluateExtractionGate(result);
  const candidates: AgentExtractionCandidate[] = [];
  const gateMetadata = {
    extractionGate: gate.reason,
    extractionSignals: gate.signals
  };

  if (!gate.allow) {
    return [];
  }

  pushEntitiesAndThemes(candidates, result, "heuristic_heading", 0.68, "heuristic", gateMetadata);
  pushSentenceCandidates(
    candidates,
    "complaint",
    sentences,
    [
      "problem",
      "issue",
      "pain",
      "difficult",
      "hard",
      "slow",
      "broken",
      "lack",
      "missing",
      "frustrat",
      "complain",
      "error",
      "challenge",
      "expensive"
    ],
    0.77,
    "heuristic_negative_sentence",
    "heuristic",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "feature_request",
    sentences,
    [
      "should",
      "could",
      "wish",
      "needs to",
      "need to",
      "needs more",
      "want",
      "would like",
      "missing",
      "feature request",
      "roadmap"
    ],
    0.79,
    "heuristic_request_sentence",
    "heuristic",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "claim",
    claimSentences,
    [" is ", " are ", " can ", " helps ", " lets ", " uses ", " supports ", " enables ", " offers "],
    0.66,
    "heuristic_claim_sentence",
    "heuristic",
    gateMetadata
  );

  return selectUniqueExtractions(candidates);
}

export function buildDocumentationExtractionCandidates(
  result: AgentSearchResult
): AgentExtractionCandidate[] {
  if (!shouldExtractFromResult(result)) {
    return [];
  }

  const sentences = sentencePool(result);
  const claimSentences = sentences.length > 0 ? sentences : splitSentences(buildDigestText(result));
  const gate = evaluateExtractionGate(result);
  const candidates: AgentExtractionCandidate[] = [];
  const gateMetadata = {
    extractionGate: gate.reason,
    extractionSignals: gate.signals
  };

  if (!gate.allow) {
    return [];
  }

  pushEntitiesAndThemes(candidates, result, "docs", 0.74, "best_effort", gateMetadata);
  pushSentenceCandidates(
    candidates,
    "claim",
    claimSentences,
    [
      "supports",
      "support",
      "allows",
      "lets",
      "can",
      "configure",
      "integrate",
      "automate",
      "workflow",
      "api",
      "sdk",
      "export",
      "import"
    ],
    0.78,
    "docs_capability_sentence",
    "best_effort",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "complaint",
    sentences,
    [
      "limitation",
      "manual",
      "slow",
      "missing",
      "cannot",
      "can't",
      "does not support",
      "hard"
    ],
    0.74,
    "docs_gap_sentence",
    "best_effort",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "feature_request",
    sentences,
    ["should", "could", "needs", "missing", "roadmap", "would help"],
    0.76,
    "docs_request_sentence",
    "best_effort",
    gateMetadata
  );

  return selectUniqueExtractions(candidates);
}

export function buildForumExtractionCandidates(
  result: AgentSearchResult
): AgentExtractionCandidate[] {
  if (!shouldExtractFromResult(result)) {
    return [];
  }

  const sentences = sentencePool(result);
  const gate = evaluateExtractionGate(result);
  const candidates: AgentExtractionCandidate[] = [];
  const gateMetadata = {
    extractionGate: gate.reason,
    extractionSignals: gate.signals
  };

  if (!gate.allow) {
    return [];
  }

  pushEntitiesAndThemes(candidates, result, "forum", 0.7, "best_effort", gateMetadata);
  pushSentenceCandidates(
    candidates,
    "complaint",
    sentences,
    [
      "issue",
      "problem",
      "pain",
      "frustrat",
      "broken",
      "slow",
      "missing",
      "hard",
      "can't",
      "cannot",
      "error",
      "annoying"
    ],
    0.84,
    "forum_pain_sentence",
    "best_effort",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "feature_request",
    sentences,
    [
      "wish",
      "should",
      "could",
      "want",
      "need",
      "please add",
      "roadmap",
      "feature request"
    ],
    0.86,
    "forum_request_sentence",
    "best_effort",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "claim",
    sentences,
    ["we use", "i use", "works", "working", "helps", "useful", "switched", "adopted"],
    0.71,
    "forum_usage_sentence",
    "best_effort",
    gateMetadata
  );

  return selectUniqueExtractions(candidates);
}

export function buildReviewExtractionCandidates(
  result: AgentSearchResult
): AgentExtractionCandidate[] {
  if (!shouldExtractFromResult(result)) {
    return [];
  }

  const sentences = sentencePool(result);
  const gate = evaluateExtractionGate(result);
  const candidates: AgentExtractionCandidate[] = [];
  const gateMetadata = {
    extractionGate: gate.reason,
    extractionSignals: gate.signals
  };

  if (!gate.allow) {
    return [];
  }

  pushEntitiesAndThemes(candidates, result, "review", 0.69, "best_effort", gateMetadata);
  pushSentenceCandidates(
    candidates,
    "complaint",
    sentences,
    [
      "difficult",
      "slow",
      "expensive",
      "confusing",
      "missing",
      "limitation",
      "issue",
      "problem",
      "support is slow",
      "bug"
    ],
    0.83,
    "review_pain_sentence",
    "best_effort",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "feature_request",
    sentences,
    ["wish", "should", "could", "needs", "want", "missing", "would like"],
    0.82,
    "review_request_sentence",
    "best_effort",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "claim",
    sentences,
    ["helps", "easy to", "useful", "best for", "good for", "works for", "saves"],
    0.74,
    "review_value_sentence",
    "best_effort",
    gateMetadata
  );

  return selectUniqueExtractions(candidates);
}

export function buildGeneralExtractionCandidates(
  result: AgentSearchResult
): AgentExtractionCandidate[] {
  if (!shouldExtractFromResult(result)) {
    return [];
  }

  const sentences = sentencePool(result);
  const claimSentences = sentences.length > 0 ? sentences : splitSentences(buildDigestText(result));
  const gate = evaluateExtractionGate(result);
  const candidates: AgentExtractionCandidate[] = [];
  const gateMetadata = {
    extractionGate: gate.reason,
    extractionSignals: gate.signals
  };

  if (!gate.allow) {
    return [];
  }

  pushEntitiesAndThemes(candidates, result, "general", 0.66, "best_effort", gateMetadata);
  pushSentenceCandidates(
    candidates,
    "claim",
    claimSentences,
    [
      "helps",
      "supports",
      "enables",
      "improves",
      "reduces",
      "provides",
      "simplifies",
      "automates",
      "creates"
    ],
    0.7,
    "general_claim_sentence",
    "best_effort",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "complaint",
    sentences,
    [
      "slow",
      "hard",
      "missing",
      "problem",
      "issue",
      "confusing",
      "manual",
      "expensive"
    ],
    0.72,
    "general_pain_sentence",
    "best_effort",
    gateMetadata
  );
  pushSentenceCandidates(
    candidates,
    "feature_request",
    sentences,
    ["should", "could", "wish", "want", "need", "would help", "would like"],
    0.73,
    "general_request_sentence",
    "best_effort",
    gateMetadata
  );

  return selectUniqueExtractions(candidates);
}

export function buildContentAwareExtractionCandidates(
  result: AgentSearchResult
): AgentExtractionCandidate[] {
  const contentType = result.contentType ?? classifyResearchContentType(result);

  if (contentType === "documentation") {
    return selectUniqueExtractions([
      ...buildDocumentationExtractionCandidates(result),
      ...buildHeuristicExtractionCandidates(result)
    ]);
  }

  if (contentType === "forum") {
    return selectUniqueExtractions([
      ...buildForumExtractionCandidates(result),
      ...buildHeuristicExtractionCandidates(result)
    ]);
  }

  if (contentType === "review") {
    return selectUniqueExtractions([
      ...buildReviewExtractionCandidates(result),
      ...buildHeuristicExtractionCandidates(result)
    ]);
  }

  if (contentType === "general") {
    return selectUniqueExtractions([
      ...buildGeneralExtractionCandidates(result),
      ...buildHeuristicExtractionCandidates(result)
    ]);
  }

  return buildHeuristicExtractionCandidates(result);
}
