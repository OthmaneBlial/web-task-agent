import path from "node:path";

import {
  captureScreenshot,
  closePageSession,
  createPageSession,
  evaluateInBrowser,
  sleep,
  waitForAnySelector,
  waitForLoadEvent,
  waitForNetworkIdle
} from "../../../lib/cdp";
import { humanScroll } from "../../../lib/humanizer";
import type {
  AgentSearchResult,
  CDPClient
} from "../../../types";
import {
  clamp,
  DUCKDUCKGO_SEARCH_PROVIDER,
  nowIso,
  QUERY_SCAN_MAX_MS,
  QUERY_SCAN_MIN_MS,
  randomBetween,
  randomInt
} from "../shared";
import type {
  AgentSearchAdapter,
  AgentSearchStageResult
} from "../search-adapter";

export class DuckDuckGoHtmlSearchAdapter implements AgentSearchAdapter {
  readonly id = DUCKDUCKGO_SEARCH_PROVIDER;
  readonly label = "DuckDuckGo HTML";

  constructor(private readonly log: (message: string) => void) {}

  buildSearchUrl(query: string): string {
    return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  }

  private async softWaitForNetworkIdle(client: CDPClient): Promise<void> {
    try {
      await waitForNetworkIdle(client, {
        timeoutMs: 6_000,
        idleTimeMs: 900,
        maxInflightRequests: 3
      });
    } catch {
      return;
    }
  }

  private async waitForSearchResults(client: CDPClient): Promise<void> {
    await waitForLoadEvent(client, 20_000);

    try {
      await waitForAnySelector(client, [".result__a", ".results .result", "a.result__url"], {
        timeoutMs: 20_000
      });
      await this.softWaitForNetworkIdle(client);
    } catch (error) {
      const pageContext = await evaluateInBrowser<{
        title: string;
        url: string;
        bodyStart: string;
      }>(
        client,
        `() => ({
          title: document.title || "",
          url: window.location.href,
          bodyStart: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 240)
        })`
      );

      throw new Error(
        `${error instanceof Error ? error.message : String(error)
        } | loaded page: ${pageContext.title} | ${pageContext.url} | ${pageContext.bodyStart}`
      );
    }
  }

  private async scanSearchResultsPage(client: CDPClient, query: string): Promise<void> {
    const dwellMs = randomInt(QUERY_SCAN_MIN_MS, QUERY_SCAN_MAX_MS);
    const segments = randomInt(2, 3);
    let remainingMs = dwellMs;

    this.log(`scanning results for "${query}" for about ${Math.round(dwellMs / 1000)}s`);

    for (let index = 0; index < segments; index += 1) {
      const stagesLeft = segments - index;
      const minTailMs = (stagesLeft - 1) * 1_500;
      const maxPauseMs = Math.max(1_500, remainingMs - minTailMs);
      const pauseMs =
        index === segments - 1
          ? remainingMs
          : clamp(
            Math.round(remainingMs / stagesLeft + randomBetween(-500, 900)),
            1_500,
            maxPauseMs
          );

      await sleep(pauseMs, 0.08);
      remainingMs -= pauseMs;

      if (index < segments - 1) {
        await humanScroll(client, {
          distancePx: randomBetween(450, 850),
          tickCount: randomInt(4, 6)
        });
      }
    }
  }

  private async scrapeSearchResults(
    client: CDPClient,
    maxResults: number
  ): Promise<AgentSearchResult[]> {
    return evaluateInBrowser<AgentSearchResult[]>(
      client,
      `(inputMaxResults) => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const siteOf = (rawUrl) => {
          try {
            return new URL(rawUrl).hostname.replace(/^www\\./, "");
          } catch {
            return "";
          }
        };

        const results = [];
        const seen = new Set();
        const cards = Array.from(document.querySelectorAll(".result, .results_links"));

        for (const card of cards) {
          const anchor = card.querySelector(".result__a, a.result__a");
          if (!anchor) {
            continue;
          }

          let href = anchor.getAttribute("href") || "";
          if (!href) {
            continue;
          }

          if (href.includes("uddg=")) {
            try {
              const uddg = new URL(href, window.location.origin).searchParams.get("uddg");
              if (uddg) {
                href = uddg;
              }
            } catch {
              // Use href as-is.
            }
          }

          let url = null;
          try {
            const parsed = new URL(href, window.location.origin);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") {
              url = parsed.toString();
            }
          } catch {
            url = null;
          }

          if (!url || seen.has(url)) {
            continue;
          }

          const title = normalize(anchor.textContent) || url;
          const snippet =
            normalize(card.querySelector(".result__snippet")?.textContent) ||
            normalize(card.querySelector(".result__body")?.textContent) ||
            "";

          results.push({
            title,
            url,
            snippet,
            site: siteOf(url)
          });
          seen.add(url);

          if (results.length >= Number(inputMaxResults)) {
            break;
          }
        }

        return results;
      }`,
      [maxResults]
    );
  }

  async search(query: string, maxResultsPerQuery: number): Promise<AgentSearchStageResult> {
    const searchUrl = this.buildSearchUrl(query);
    let client: CDPClient | null = null;

    try {
      client = await createPageSession(searchUrl);
      await this.waitForSearchResults(client);
      await this.scanSearchResultsPage(client, query);

      return {
        query,
        searchedAt: nowIso(),
        searchUrl,
        searchProvider: this.id,
        results: await this.scrapeSearchResults(client, maxResultsPerQuery)
      };
    } catch (error) {
      if (client) {
        const screenshotPath = path.join("/tmp", `agent-research-${Date.now()}.png`);
        try {
          await captureScreenshot(client, screenshotPath);
        } catch {
          // Ignore screenshot failures.
        }
      }

      throw error;
    } finally {
      if (client) {
        await closePageSession(client);
      }
    }
  }
}

export function createDefaultAgentSearchAdapter(
  log: (message: string) => void
): AgentSearchAdapter {
  return new DuckDuckGoHtmlSearchAdapter(log);
}
