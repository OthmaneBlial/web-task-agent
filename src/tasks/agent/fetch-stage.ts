import {
  closePageSession,
  createPageSession,
  evaluateInBrowser,
  sleep
} from "../../lib/cdp";
import { humanScroll } from "../../lib/humanizer";
import type {
  AgentPageDigest,
  AgentSearchResult,
  CDPClient
} from "../../types";
import {
  ARTICLE_READ_MAX_MS,
  clamp,
  estimateArticleReadMs,
  isReadablePage,
  looksLikeErrorPage,
  MAX_ARTICLES_PER_QUERY,
  QUICK_SKIP_MAX_MS,
  QUICK_SKIP_MIN_MS,
  randomBetween,
  randomInt
} from "./shared";

export interface AgentFetchStageSummary {
  visitedResults: number;
  documentsCaptured: number;
  readResults: number;
  skippedResults: number;
  errorResults: number;
}

export function summarizeFetchedResults(results: AgentSearchResult[]): AgentFetchStageSummary {
  return {
    visitedResults: results.filter((result) => Boolean(result.page) || Boolean(result.reviewStatus)).length,
    documentsCaptured: results.filter((result) => Boolean(result.page)).length,
    readResults: results.filter((result) => result.reviewStatus === "read").length,
    skippedResults: results.filter((result) => result.reviewStatus === "skipped").length,
    errorResults: results.filter((result) => result.reviewStatus === "error").length
  };
}

export class AgentFetchStage {
  constructor(private readonly log: (message: string) => void) {}

  private async scrapePageDigest(client: CDPClient): Promise<AgentPageDigest> {
    return evaluateInBrowser<AgentPageDigest>(
      client,
      `() => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const meta = (selector) => normalize(document.querySelector(selector)?.getAttribute("content")) || "";

        return {
          title: normalize(document.title) || window.location.hostname,
          url: window.location.href,
          description:
            meta('meta[name="description"]') ||
            meta('meta[property="og:description"]') ||
            "",
          h1: normalize(document.querySelector("h1")?.textContent) || null,
          headings: Array.from(document.querySelectorAll("h2, h3"))
            .map((node) => normalize(node.textContent))
            .filter((text) => text.length > 4)
            .slice(0, 6),
          paragraphs: Array.from(document.querySelectorAll("main p, article p, p"))
            .map((node) => normalize(node.textContent))
            .filter((text) => text.length >= 80)
            .slice(0, 4),
          capturedAt: new Date().toISOString()
        };
      }`
    );
  }

  private async readOpenedPage(
    client: CDPClient,
    result: AgentSearchResult,
    page: AgentPageDigest
  ): Promise<Pick<AgentSearchResult, "reviewStatus" | "dwellSeconds" | "skipReason">> {
    if (!isReadablePage(page)) {
      const skipReason = looksLikeErrorPage(page) ? "error-like page" : "thin content";
      const skipMs = randomInt(QUICK_SKIP_MIN_MS, QUICK_SKIP_MAX_MS);
      this.log(`skipping page quickly: ${page.title || result.title} (${skipReason})`);
      await sleep(skipMs, 0.05);
      return {
        reviewStatus: "skipped",
        dwellSeconds: Math.max(1, Math.round(skipMs / 1_000)),
        skipReason
      };
    }

    const dwellMs = estimateArticleReadMs(page);
    const segments = Math.max(3, Math.min(6, Math.round(dwellMs / 10_000)));
    let remainingMs = dwellMs;

    this.log(`reading article: ${page.title || result.title} for about ${Math.round(dwellMs / 1_000)}s`);

    for (let index = 0; index < segments; index += 1) {
      const stagesLeft = segments - index;
      const minTailMs = (stagesLeft - 1) * 2_500;
      const maxPauseMs = Math.max(2_500, remainingMs - minTailMs);
      const pauseMs =
        index === segments - 1
          ? remainingMs
          : clamp(
            Math.round(remainingMs / stagesLeft + randomBetween(-1_000, 1_400)),
            2_500,
            maxPauseMs
          );

      await sleep(pauseMs, 0.08);
      remainingMs -= pauseMs;

      if (index < segments - 1) {
        await humanScroll(client, {
          distancePx: randomBetween(520, 1_050),
          tickCount: randomInt(4, 7)
        });

        if (Math.random() < 0.22) {
          await humanScroll(client, {
            direction: "up",
            distancePx: randomBetween(120, 260),
            tickCount: randomInt(3, 4)
          });
        }
      }
    }

    return {
      reviewStatus: "read",
      dwellSeconds: Math.round(dwellMs / 1_000)
    };
  }

  async fetchResults(results: AgentSearchResult[]): Promise<AgentSearchResult[]> {
    const enriched: AgentSearchResult[] = [];

    for (const result of results) {
      let client: CDPClient | null = null;

      try {
        this.log(`opening article: ${result.title}`);
        client = await createPageSession(result.url);
        result.page = await this.scrapePageDigest(client);
        Object.assign(result, await this.readOpenedPage(client, result, result.page));
      } catch (error) {
        result.page = undefined;
        result.reviewStatus = "error";
        result.skipReason = error instanceof Error ? error.message : String(error);
        this.log(`failed article: ${result.title} (${result.skipReason})`);
      } finally {
        if (client) {
          await closePageSession(client);
        }
      }

      enriched.push(result);
      await sleep(220, 0.1);
    }

    return enriched;
  }

  async fetchTopResults(
    rawResults: AgentSearchResult[],
    maxArticlesPerQuery: number = MAX_ARTICLES_PER_QUERY
  ): Promise<AgentSearchResult[]> {
    const enriched = await this.fetchResults(
      rawResults.slice(0, Math.min(maxArticlesPerQuery, rawResults.length))
    );
    const byUrl = new Map(enriched.map((entry) => [entry.url, entry]));
    return rawResults.map((entry) => byUrl.get(entry.url) ?? entry);
  }
}
