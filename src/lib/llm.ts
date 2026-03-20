import Anthropic from "@anthropic-ai/sdk";

import type {
  AgentEvidenceBundle,
  AgentCommentsDraft,
  AgentReferencedEvidence,
  AgentPlan,
  AgentPlanStep,
  AgentPostDraft,
  AgentResearchReferenceItem,
  AgentResearchResult,
  AgentResearchSummary,
  GitHubRepo,
  MarketInsightReport,
  PlayStoreAppDetail,
  ScoredRepo
} from "../types";

interface RepositorySelectionResponse {
  winners: Array<{
    url: string;
    score: number;
    reasoning: string;
  }>;
}

interface AgentPlanResponse {
  summary?: string;
  tone?: string;
  estimatedMinutes?: number;
  approvalRequired?: boolean;
  deliverables?: string[];
  researchQueries?: string[];
  steps?: Array<Partial<AgentPlanStep>>;
}

interface AgentResearchSummaryResponse {
  executiveSummary?: string;
  keyFindings?: string[];
  contentAngles?: string[];
}

interface AgentEvidenceSummaryResponse {
  executiveSummary?: string;
  keyFindings?: Array<{
    text?: string;
    evidenceIds?: string[];
  }>;
  contentAngles?: Array<{
    text?: string;
    evidenceIds?: string[];
  }>;
}

interface AgentPostDraftResponse {
  headline?: string;
  body?: string;
  callToAction?: string;
}

interface AgentCommentsDraftResponse {
  comments?: string[];
}

const DEFAULT_BASE_URL = process.env.ANTHROPIC_BASE_URL ?? process.env.ZAI_BASE_URL;
const DEFAULT_API_KEY =
  process.env.ANTHROPIC_API_KEY ?? process.env.ZAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN;
const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL ?? process.env.ZAI_MODEL ?? "claude-sonnet-4-20250514";
const DEFAULT_TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS ?? "90000");

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function uniqueStrings(values: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
    if (typeof limit === "number" && output.length >= limit) {
      break;
    }
  }

  return output;
}

function tokenizeForMatch(text: string): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "have",
    "has",
    "had",
    "they",
    "them",
    "their",
    "about",
    "because",
    "would",
    "could",
    "should",
    "want",
    "users",
    "using",
    "more",
    "than",
    "into",
    "what",
    "when",
    "where",
    "which"
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function uniqueEvidenceIds(values: string[], allowedIds: Set<string>, limit: number = 3): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized) || !allowedIds.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function buildEvidenceReferenceLookup(
  evidence: AgentEvidenceBundle
): Map<string, AgentReferencedEvidence> {
  const lookup = new Map<string, AgentReferencedEvidence>();

  for (const source of evidence.sources) {
      lookup.set(source.sourceId, {
        id: source.sourceId,
        sourceId: source.sourceId,
        query: source.query,
        sourceTitle: source.title,
        sourceUrl: source.url,
        kind: "source",
        value: source.snippet || source.description || source.title,
        overallScore: source.overallScore
      });

      for (const extraction of source.extractions) {
        lookup.set(extraction.id, {
          id: extraction.id,
        sourceId: extraction.sourceId,
          query: source.query,
          sourceTitle: source.title,
          sourceUrl: source.url,
          kind: extraction.kind,
          value: extraction.value,
          confidence: extraction.confidence,
          overallScore: Number((source.overallScore * 0.6 + extraction.confidence * 0.4).toFixed(2))
        });
      }
    }

  return lookup;
}

function suggestEvidenceIdsForText(
  text: string,
  referenceLookup: Map<string, AgentReferencedEvidence>,
  limit: number = 3
): string[] {
  const queryTokens = new Set(tokenizeForMatch(text));
  if (queryTokens.size === 0) {
    return [];
  }

  const ranked = Array.from(referenceLookup.values())
    .map((reference) => {
      const haystackTokens = tokenizeForMatch(
        `${reference.sourceTitle} ${reference.value} ${reference.query}`
      );
      let overlap = 0;
      for (const token of haystackTokens) {
        if (queryTokens.has(token)) {
          overlap += 1;
        }
      }
      const confidenceBoost = reference.confidence ?? (reference.kind === "source" ? 0.4 : 0.5);
      const overallBoost = reference.overallScore ?? 0.5;
      return {
        id: reference.id,
        score: overlap + confidenceBoost + overallBoost
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of ranked) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    output.push(item.id);
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (block && typeof block === "object" && "type" in block && "text" in block) {
        const typed = block as { type?: string; text?: string };
        return typed.type === "text" ? typed.text ?? "" : "";
      }
      return "";
    })
    .join("\n")
    .trim();
}

function extractJsonPayload<T>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("model returned an empty response");
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error(`could not parse Claude JSON response: ${trimmed.slice(0, 240)}`);
  }
}

function normalizePlanSteps(steps: Array<Partial<AgentPlanStep>> | undefined): AgentPlanStep[] {
  const allowedKinds = new Set<AgentPlanStep["kind"]>([
    "research",
    "draft_post",
    "draft_comments",
    "review",
    "report"
  ]);

  const normalized: Array<AgentPlanStep | null> = (steps ?? []).map((step, index) => {
      const kind =
        typeof step.kind === "string" && allowedKinds.has(step.kind as AgentPlanStep["kind"])
          ? (step.kind as AgentPlanStep["kind"])
          : null;
      if (!kind) {
        return null;
      }

      return {
        id: String(step.id ?? `step_${index + 1}`),
        kind,
        title: String(step.title ?? kind.replace(/_/g, " ")).trim(),
        goal: String(step.goal ?? "").trim() || "Complete this step well.",
        status: "pending"
      };
    });

  return normalized.filter((step): step is AgentPlanStep => step !== null);
}

function buildFallbackPlan(instruction: string): AgentPlan {
  return {
    summary: instruction.trim(),
    tone: "clear, upbeat, and human",
    estimatedMinutes: 15,
    approvalRequired: true,
    deliverables: ["job report"],
    researchQueries: [],
    steps: [
      {
        id: "step_1",
        kind: "report",
        title: "Prepare report",
        goal: "Summarize the plan and current outputs.",
        status: "pending"
      }
    ]
  };
}

export class LlmService {
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(model: string = DEFAULT_MODEL) {
    if (!DEFAULT_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is missing");
    }
    if (!DEFAULT_BASE_URL) {
      throw new Error("ANTHROPIC_BASE_URL is missing");
    }

    this.anthropic = new Anthropic({
      apiKey: DEFAULT_API_KEY,
      baseURL: DEFAULT_BASE_URL,
      timeout: DEFAULT_TIMEOUT_MS,
      maxRetries: 1
    });
    this.model = model;
  }

  private async requestJson<T>(system: string, prompt: string, maxTokens: number): Promise<T> {
    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    return extractJsonPayload<T>(extractTextContent(response.content));
  }

  private async evaluateRepositoryChunk(
    repos: GitHubRepo[],
    criteria: string,
    winnerCount: number,
    stage: "chunk" | "final"
  ): Promise<ScoredRepo[]> {
    const compactRepos = repos.map((repo) => ({
      url: repo.url,
      fullName: repo.fullName,
      description: repo.description,
      tags: repo.tags,
      language: repo.language,
      stars: repo.stars
    }));

    const system = [
      "You are a cynical senior developer reviewing open-source repositories.",
      "You hate cookie-cutter SaaS clones, CRUD demos, thin wrappers, and repo spam.",
      "You only reward projects that teach something non-obvious, expose novel engineering choices,",
      "or show unusual technical ambition relative to their size."
    ].join(" ");

    const prompt = [
      `Task: pick the ${winnerCount} most technically interesting repositories for this ${stage} stage.`,
      `Criteria: ${criteria}`,
      "Rules:",
      "- Prefer original technical ideas, educational value, difficult implementation work, systems work, compilers, runtimes, graphics, networking, or other unusual engineering depth.",
      "- Penalize templates, aggregators, tutorials, boilerplate stacks, abandoned shells, and README-heavy but code-light repos.",
      "- Use scores from 0 to 100.",
      '- Return strict JSON with this exact shape: {"winners":[{"url":"...","score":91,"reasoning":"..."}]}',
      "- Do not include prose outside the JSON.",
      "",
      JSON.stringify({ repositories: compactRepos }, null, 2)
    ].join("\n");

    const payload = await this.requestJson<RepositorySelectionResponse>(system, prompt, 4_000);
    const repoByUrl = new Map(repos.map((repo) => [repo.url, repo]));
    const winners: ScoredRepo[] = [];

    for (const winner of payload.winners ?? []) {
      const repo = repoByUrl.get(winner.url);
      if (!repo) {
        continue;
      }
      winners.push({
        ...repo,
        score: clampScore(winner.score),
        reasoning: winner.reasoning.trim()
      });
    }

    if (winners.length === 0) {
      throw new Error("Claude did not return any valid repository winners for the chunk");
    }

    return winners;
  }

  async evaluateRepositories(repos: GitHubRepo[], criteria: string): Promise<ScoredRepo[]> {
    if (repos.length === 0) {
      return [];
    }

    const chunkSize = 40;
    const chunkWinnerCount = 3;
    const finalists: ScoredRepo[] = [];

    for (const chunk of chunkArray(repos, chunkSize)) {
      const winners = await this.evaluateRepositoryChunk(
        chunk,
        criteria,
        Math.min(chunkWinnerCount, chunk.length),
        "chunk"
      );
      finalists.push(...winners);
    }

    const dedupedFinalists = Array.from(
      finalists.reduce((map, repo) => {
        const existing = map.get(repo.url);
        if (!existing || repo.score > existing.score) {
          map.set(repo.url, repo);
        }
        return map;
      }, new Map<string, ScoredRepo>())
    ).map((entry) => entry[1]);

    if (dedupedFinalists.length <= 10) {
      return dedupedFinalists.sort((left, right) => right.score - left.score).slice(0, 10);
    }

    const finalWinners = await this.evaluateRepositoryChunk(
      dedupedFinalists,
      criteria,
      Math.min(10, dedupedFinalists.length),
      "final"
    );

    return finalWinners.sort((left, right) => right.score - left.score).slice(0, 10);
  }

  async generatePlayStoreInsights(
    apps: PlayStoreAppDetail[],
    keyword: string
  ): Promise<MarketInsightReport> {
    const system = [
      "You are a product strategist and market researcher.",
      "Synthesize direct product positioning, repeated feature patterns, weak spots, and sentiment clues.",
      "Be concrete and concise. Prefer evidence over generic marketing language."
    ].join(" ");

    const prompt = [
      `Analyze the Google Play market for the keyword: ${keyword}`,
      "Return strict JSON with this exact schema:",
      '{"keyword":"...","analyzedAt":"ISO-8601 string","executiveSummary":"...","commonFeatures":["..."],"missingFeatures":["..."],"averageSentiment":"...","competitorPositioning":["..."],"standoutApps":["..."]}',
      "Rules:",
      "- Use only the supplied app summaries, descriptions, and review snippets.",
      "- Mention missing features only when the dataset implies a gap or repeated complaint.",
      "- Keep list items crisp and non-redundant.",
      "- Do not include prose outside the JSON.",
      "",
      JSON.stringify({ keyword, apps }, null, 2)
    ].join("\n");

    return this.requestJson<MarketInsightReport>(system, prompt, 4_000);
  }

  async planAgentJob(input: {
    instruction: string;
    memory?: string;
    maxQueries?: number;
  }): Promise<AgentPlan> {
    const maxQueries = Math.max(0, Math.min(5, input.maxQueries ?? 3));
    const system = [
      "You are an execution planner for a simple browser agent.",
      "Turn a natural-language request into a small, realistic plan that can be executed in order.",
      "Prefer simple steps, concrete deliverables, and human review before anything public-facing."
    ].join(" ");

    const prompt = [
      "Plan this job.",
      `Instruction: ${input.instruction}`,
      input.memory ? `Memory / product context:\n${input.memory}` : "Memory / product context: none provided",
      "",
      "Return strict JSON with this exact schema:",
      '{"summary":"...","tone":"...","estimatedMinutes":18,"approvalRequired":true,"deliverables":["..."],"researchQueries":["..."],"steps":[{"id":"step_1","kind":"research","title":"...","goal":"...","status":"pending"}]}',
      "Rules:",
      `- Keep researchQueries to at most ${maxQueries}.`,
      "- Allowed step kinds: research, draft_post, draft_comments, review, report.",
      "- Use review for any step that should wait for user approval.",
      "- Make the tone match the request. If the request feels joyful, keep it bright and warm instead of clinical.",
      "- Keep the plan realistic for a single run.",
      "- Do not include prose outside the JSON."
    ].join("\n");

    const payload = await this.requestJson<AgentPlanResponse>(system, prompt, 3_000);
    const steps = normalizePlanSteps(payload.steps);

    const normalizedPlan: AgentPlan = {
      summary: String(payload.summary ?? input.instruction).trim() || input.instruction.trim(),
      tone: String(payload.tone ?? "clear, upbeat, and human").trim() || "clear, upbeat, and human",
      estimatedMinutes: Math.max(
        5,
        Math.min(180, Math.round(Number(payload.estimatedMinutes ?? 15) || 15))
      ),
      approvalRequired: payload.approvalRequired !== false,
      deliverables: uniqueStrings(
        Array.isArray(payload.deliverables) ? payload.deliverables.map(String) : ["job report"],
        8
      ),
      researchQueries: uniqueStrings(
        Array.isArray(payload.researchQueries) ? payload.researchQueries.map(String) : [],
        maxQueries
      ),
      steps:
        steps.length > 0
          ? steps
          : buildFallbackPlan(input.instruction).steps
    };

    if (normalizedPlan.deliverables.length === 0) {
      normalizedPlan.deliverables = ["job report"];
    }

    return normalizedPlan;
  }

  async synthesizeAgentResearch(input: {
    instruction: string;
    research: AgentResearchResult[];
  }): Promise<AgentResearchSummary> {
    const system = [
      "You synthesize light web research for product and content work.",
      "Prefer concrete patterns, repeated signals, and useful marketing angles over generic summaries."
    ].join(" ");

    const prompt = [
      `Instruction: ${input.instruction}`,
      "Return strict JSON with this exact schema:",
      '{"executiveSummary":"...","keyFindings":["..."],"contentAngles":["..."]}',
      "Rules:",
      "- Use only the supplied research snippets and page digests.",
      "- Keep findings concise and evidence-oriented.",
      "- Keep content angles lively and practical.",
      "- Do not include prose outside the JSON.",
      "",
      JSON.stringify({ research: input.research }, null, 2)
    ].join("\n");

    const payload = await this.requestJson<AgentResearchSummaryResponse>(system, prompt, 3_000);
    return {
      executiveSummary:
        String(payload.executiveSummary ?? "").trim() || "Research gathered. Review the source notes below.",
      keyFindings: uniqueStrings(
        Array.isArray(payload.keyFindings) ? payload.keyFindings.map(String) : [],
        6
      ),
      contentAngles: uniqueStrings(
        Array.isArray(payload.contentAngles) ? payload.contentAngles.map(String) : [],
        6
      ),
      keyFindingDetails: [],
      contentAngleDetails: [],
      referencedEvidence: []
    };
  }

  async synthesizeAgentEvidence(input: {
    instruction: string;
    evidence: AgentEvidenceBundle;
  }): Promise<AgentResearchSummary> {
    const referenceLookup = buildEvidenceReferenceLookup(input.evidence);
    const allowedIds = new Set(referenceLookup.keys());
    const compactEvidence = {
      counts: input.evidence.counts,
      queries: input.evidence.queries,
      highlights: input.evidence.highlights,
      contradictions: input.evidence.contradictions.slice(0, 12).map((item) => ({
        id: item.id,
        topic: item.topic,
        leftClusterId: item.leftClusterId,
        rightClusterId: item.rightClusterId,
        leftLabel: item.leftLabel,
        rightLabel: item.rightLabel,
        contradictionScore: item.contradictionScore,
        reason: item.reason,
        evidenceIds: item.evidenceIds.slice(0, 6)
      })),
      clusters: input.evidence.clusters.slice(0, 24).map((cluster) => ({
        id: cluster.id,
        kind: cluster.kind,
        label: cluster.label,
        sourceCount: cluster.sourceCount,
        evidenceCount: cluster.evidenceCount,
        averageConfidence: cluster.averageConfidence,
        qualityScore: cluster.qualityScore,
        freshnessScore: cluster.freshnessScore,
        trendScore: cluster.trendScore,
        overallScore: cluster.overallScore,
        queries: cluster.queries,
        evidenceIds: cluster.evidenceIds.slice(0, 6),
        supportingValues: cluster.supportingValues.slice(0, 4)
      })),
      sources: input.evidence.sources.slice(0, 20).map((source) => ({
        sourceId: source.sourceId,
        query: source.query,
        rank: source.rank,
        title: source.title,
        url: source.url,
        site: source.site,
        snippet: source.snippet,
        description: source.description,
        contentType: source.contentType,
        reviewStatus: source.reviewStatus ?? null,
        sourceQualityScore: source.sourceQualityScore,
        freshnessScore: source.freshnessScore,
        trendScore: source.trendScore,
        overallScore: source.overallScore,
        qualitySignals: source.qualitySignals.slice(0, 4),
        headings: source.headings.slice(0, 4),
        paragraphs: source.paragraphs.slice(0, 2),
        extractions: source.extractions.slice(0, 10).map((extraction) => ({
          id: extraction.id,
          kind: extraction.kind,
          value: extraction.value,
          confidence: extraction.confidence
        }))
      }))
    };

    const system = [
      "You synthesize web research from a persisted evidence bundle.",
      "Prefer repeated patterns, concrete findings, and useful angles grounded in the extracted evidence.",
      "Treat persisted queries, sources, document snapshots, and extraction rows as the only source of truth.",
      "Use clustered repeated evidence as the primary signal when multiple sources support the same point.",
      "If there are meaningful contradictions in the evidence, mention them clearly instead of flattening them away.",
      "You must reference evidence ids from the bundle for every finding and angle."
    ].join(" ");

    const prompt = [
      `Instruction: ${input.instruction}`,
      "Return strict JSON with this exact schema:",
      '{"executiveSummary":"...","keyFindings":[{"text":"...","evidenceIds":["ext_x","src_y"]}],"contentAngles":[{"text":"...","evidenceIds":["ext_x"]}]}',
      "Rules:",
      "- Use only the supplied persisted evidence bundle.",
      "- Prefer findings backed by repeated complaints, requests, themes, claims, or multiple sources.",
      "- Prefer clusters with higher trendScore and higher sourceCount when choosing the most important repeated findings.",
      "- Treat trendScore as the signal for fresh, cross-source momentum.",
      "- When contradictions are present, reflect that disagreement in the summary or findings where relevant.",
      "- Every finding and every content angle must include 1 to 3 evidence ids from the bundle.",
      "- Prefer extraction ids when possible. Use source ids when the source itself is the best evidence unit.",
      "- Do not invent ids. Use only ids that exist in the supplied evidence bundle.",
      "- Keep findings concise and evidence-oriented.",
      "- Keep content angles lively and practical.",
      "- Do not include prose outside the JSON.",
      "",
      JSON.stringify({ evidence: compactEvidence }, null, 2)
    ].join("\n");

    const payload = await this.requestJson<AgentEvidenceSummaryResponse>(system, prompt, 3_000);

    const normalizeItems = (
      items: AgentEvidenceSummaryResponse["keyFindings"] | AgentEvidenceSummaryResponse["contentAngles"]
    ): AgentResearchReferenceItem[] => {
      const normalized: AgentResearchReferenceItem[] = [];

      for (const item of items ?? []) {
        const text = String(item?.text ?? "").replace(/\s+/g, " ").trim();
        if (!text) {
          continue;
        }

        const explicitIds = uniqueEvidenceIds(
          Array.isArray(item?.evidenceIds) ? item!.evidenceIds.map(String) : [],
          allowedIds,
          3
        );
        const evidenceIds =
          explicitIds.length > 0 ? explicitIds : suggestEvidenceIdsForText(text, referenceLookup, 3);

        normalized.push({
          text,
          evidenceIds
        });
      }

      return normalized;
    };

    const keyFindingDetails = normalizeItems(payload.keyFindings).slice(0, 6);
    const contentAngleDetails = normalizeItems(payload.contentAngles).slice(0, 6);
    const referencedIds = uniqueEvidenceIds(
      [...keyFindingDetails, ...contentAngleDetails].flatMap((item) => item.evidenceIds),
      allowedIds,
      24
    );

    return {
      executiveSummary:
        String(payload.executiveSummary ?? "").trim() || "Evidence gathered. Review the persisted sources below.",
      keyFindings: uniqueStrings(keyFindingDetails.map((item) => item.text), 6),
      contentAngles: uniqueStrings(contentAngleDetails.map((item) => item.text), 6),
      keyFindingDetails,
      contentAngleDetails,
      referencedEvidence: referencedIds
        .map((id) => referenceLookup.get(id))
        .filter((value): value is AgentReferencedEvidence => Boolean(value))
    };
  }

  async draftAgentPost(input: {
    instruction: string;
    plan: AgentPlan;
    researchSummary?: AgentResearchSummary | null;
    memory?: string;
  }): Promise<AgentPostDraft> {
    const system = [
      "You write polished social and product marketing drafts.",
      "Sound human, specific, and lively. Avoid stiff corporate filler."
    ].join(" ");

    const prompt = [
      `Instruction: ${input.instruction}`,
      `Plan summary: ${input.plan.summary}`,
      `Desired tone: ${input.plan.tone}`,
      input.memory ? `Memory / product context:\n${input.memory}` : "Memory / product context: none provided",
      "",
      "Research summary:",
      JSON.stringify(input.researchSummary ?? null, null, 2),
      "",
      "Return strict JSON with this exact schema:",
      '{"headline":"...","body":"...","callToAction":"..."}',
      "Rules:",
      "- Write one strong draft post.",
      "- Keep it warm, specific, and easy to edit.",
      "- The body can be multi-paragraph plain text.",
      "- Avoid making factual claims that are not supported by the research summary or provided memory.",
      "- Do not include prose outside the JSON."
    ].join("\n");

    const payload = await this.requestJson<AgentPostDraftResponse>(system, prompt, 2_500);
    return {
      headline: String(payload.headline ?? "Draft Post").trim() || "Draft Post",
      body: String(payload.body ?? "").trim() || "Draft body not generated.",
      callToAction: String(payload.callToAction ?? "").trim() || "Tell me what to refine before publishing."
    };
  }

  async draftAgentComments(input: {
    instruction: string;
    plan: AgentPlan;
    researchSummary?: AgentResearchSummary | null;
    memory?: string;
    count?: number;
  }): Promise<AgentCommentsDraft> {
    const desiredCount = Math.max(1, Math.min(10, input.count ?? 5));
    const system = [
      "You write short, human comments for communities and social threads.",
      "Comments should feel natural, useful, and not spammy."
    ].join(" ");

    const prompt = [
      `Instruction: ${input.instruction}`,
      `Plan summary: ${input.plan.summary}`,
      `Desired tone: ${input.plan.tone}`,
      input.memory ? `Memory / product context:\n${input.memory}` : "Memory / product context: none provided",
      "",
      "Research summary:",
      JSON.stringify(input.researchSummary ?? null, null, 2),
      "",
      "Return strict JSON with this exact schema:",
      `{"comments":["..."]}`,
      "Rules:",
      `- Write exactly ${desiredCount} distinct comments.`,
      "- Keep each comment concise, warm, and believable.",
      "- Avoid sounding like a hard sell.",
      "- Do not include prose outside the JSON."
    ].join("\n");

    const payload = await this.requestJson<AgentCommentsDraftResponse>(system, prompt, 2_500);
    const comments = uniqueStrings(
      Array.isArray(payload.comments) ? payload.comments.map(String) : [],
      desiredCount
    );

    return {
      comments:
        comments.length > 0
          ? comments
          : ["Draft comment not generated. Ask for a fresh draft after reviewing the brief."]
    };
  }
}
