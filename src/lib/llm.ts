import Anthropic from "@anthropic-ai/sdk";

import type {
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
}
