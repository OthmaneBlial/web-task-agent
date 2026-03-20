import type {
  AgentExtractionCandidate,
  AgentSearchResult
} from "../types";

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

function selectUniqueExtractions(
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
  const matches = text.match(/\b(?:[A-Z][a-z0-9]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z0-9]+|[A-Z]{2,})){0,3}\b/g) ?? [];
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
  const candidates = [
    result.page?.h1 ?? "",
    result.title,
    ...(result.page?.headings ?? [])
  ];

  return candidates
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 6 && value.length <= 90)
    .slice(0, 10);
}

function extractSentencesByTerms(sentences: string[], terms: string[]): string[] {
  return sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });
}

export function buildHeuristicExtractionCandidates(
  result: AgentSearchResult
): AgentExtractionCandidate[] {
  const combinedText = buildDigestText(result);
  const sentences = splitSentences(
    [
      result.snippet,
      result.page?.description ?? "",
      ...(result.page?.paragraphs ?? [])
    ]
      .filter(Boolean)
      .join(" ")
  );
  const claimSentences = splitSentences(
    [
      result.snippet,
      result.page?.description ?? "",
      ...(result.page?.paragraphs ?? [])
    ]
      .filter(Boolean)
      .join(" ")
  );
  const titleText = normalizeText(
    [
      result.title,
      result.page?.title ?? "",
      result.page?.h1 ?? ""
    ]
      .filter(Boolean)
      .join(" ")
  );
  const candidates: AgentExtractionCandidate[] = [];

  for (const entity of extractCandidateEntities(titleText)) {
    candidates.push({
      kind: "entity",
      value: entity,
      evidenceText: titleText,
      confidence: 0.72,
      method: "heuristic_capitalized_phrase",
      metadata: {
        source: "title"
      }
    });
  }

  for (const theme of extractThemePhrases(result)) {
    candidates.push({
      kind: "theme",
      value: theme,
      evidenceText: theme,
      confidence: 0.68,
      method: "heuristic_heading_theme",
      metadata: {
        source: "headings"
      }
    });
  }

  for (const complaint of extractSentencesByTerms(sentences, [
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
  ])) {
    candidates.push({
      kind: "complaint",
      value: complaint,
      evidenceText: complaint,
      confidence: 0.77,
      method: "heuristic_negative_sentence"
    });
  }

  for (const request of extractSentencesByTerms(sentences, [
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
  ])) {
    candidates.push({
      kind: "feature_request",
      value: request,
      evidenceText: request,
      confidence: 0.79,
      method: "heuristic_request_sentence"
    });
  }

  for (const claim of extractSentencesByTerms(
    claimSentences.length > 0 ? claimSentences : splitSentences(combinedText),
    [" is ", " are ", " can ", " helps ", " lets ", " uses ", " supports ", " enables ", " offers "]
  )) {
    candidates.push({
      kind: "claim",
      value: claim,
      evidenceText: claim,
      confidence: 0.66,
      method: "heuristic_claim_sentence"
    });
  }

  return selectUniqueExtractions(candidates);
}
