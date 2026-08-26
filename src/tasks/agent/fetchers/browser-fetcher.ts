import {
  closePageSession,
  createPageSession,
  evaluateInBrowser,
  sleep,
  withLightpandaRecovery
} from "../../../lib/cdp";
import { humanScroll } from "../../../lib/humanizer";
import { detectPromptInjectionSignals } from "../../../lib/source-policy";
import { SourceAcquisitionPolicy } from "../../../lib/source-acquisition-policy";
import type {
  AgentPageDigest,
  AgentSearchResult,
  CDPClient
} from "../../../types";
import {
  assessDocumentQuality,
  clamp,
  classifyResearchContentType,
  evaluateDomainPolicy,
  estimateArticleReadMs,
  QUICK_SKIP_MAX_MS,
  QUICK_SKIP_MIN_MS,
  randomBetween,
  randomInt
} from "../shared";
import type { AgentFetcher } from "../fetcher";

function normalizeBrowserUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }

    for (const param of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "gclid",
      "fbclid",
      "msclkid"
    ]) {
      parsed.searchParams.delete(param);
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export class BrowserPageFetcher implements AgentFetcher {
  readonly id = "browser_page_fetcher";
  readonly label = "Browser Page Fetcher";

  constructor(
    private readonly log: (message: string) => void,
    private readonly acquisitionPolicy: Pick<SourceAcquisitionPolicy, "prepare" | "userAgent"> = new SourceAcquisitionPolicy()
  ) {}

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
    if ((page.safetySignals?.length ?? 0) > 0) {
      const skipReason = `potential prompt injection detected: ${page.safetySignals!.join(", ")}`;
      this.log(`quarantining page before extraction: ${page.title || result.title} (${skipReason})`);
      return { reviewStatus: "skipped", dwellSeconds: 0, skipReason };
    }
    const quality = assessDocumentQuality(result, page);
    result.qualityScore = quality.score;
    result.qualitySignals = quality.signals;

    if (!quality.readable) {
      const skipReason = quality.reason;
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
      const normalizedUrl = normalizeBrowserUrl(result.url);
      if (normalizedUrl) {
        result.url = normalizedUrl;
      }
      const sourcePolicy = await this.acquisitionPolicy.prepare(result.url);
      if (sourcePolicy.action === "deny") {
        result.policyAction = "skip";
        result.policyReason = sourcePolicy.reason;
        result.qualitySignals = sourcePolicy.signals;
        result.reviewStatus = "skipped";
        result.dwellSeconds = 0;
        result.skipReason = sourcePolicy.reason;
        result.qualityScore = 0;
        this.log(`skipping unsafe source before open: ${result.title} (${sourcePolicy.reason})`);
        enriched.push(result);
        continue;
      }
      if (sourcePolicy.waitedMs > 0) {
        this.log(`rate limited ${result.title} for ${sourcePolicy.waitedMs}ms before opening the next source`);
      }
      result.contentType = result.contentType ?? classifyResearchContentType(result);
      const policy = evaluateDomainPolicy(result);
      result.policyAction = policy.action;
      result.policyReason = policy.reason;
      result.qualitySignals = policy.signals;

      if (policy.action === "skip") {
        const skipMs = randomInt(QUICK_SKIP_MIN_MS, QUICK_SKIP_MAX_MS);
        this.log(`skipping result before open: ${result.title} (${policy.reason})`);
        await sleep(skipMs, 0.05);
        result.reviewStatus = "skipped";
        result.dwellSeconds = Math.max(1, Math.round(skipMs / 1_000));
        result.skipReason = policy.reason;
        result.qualityScore = 0;
        enriched.push(result);
        await sleep(220, 0.1);
        continue;
      }

      try {
        const fetched = await withLightpandaRecovery({
          label: `fetch article "${result.title}"`,
          onRetry: async (_attempt, error) => {
            this.log(
              `Lightpanda session dropped while fetching ${result.title}. Restarting browser and retrying once. (${error instanceof Error ? error.message : String(error)})`
            );
          },
          task: async () => {
            let client: CDPClient | null = null;
            try {
              this.log(`opening article: ${result.title}`);
              client = await createPageSession(result.url, { userAgent: this.acquisitionPolicy.userAgent });
              const page = await this.scrapePageDigest(client);
              page.safetySignals = detectPromptInjectionSignals([
                page.title,
                page.description,
                page.h1 ?? "",
                ...page.headings,
                ...page.paragraphs
              ]);
              const review = await this.readOpenedPage(client, result, page);
              return {
                page,
                review
              };
            } finally {
              if (client) {
                await closePageSession(client);
              }
            }
          }
        });
        result.page = fetched.page;
        Object.assign(result, fetched.review);
      } catch (error) {
        result.page = undefined;
        result.reviewStatus = "error";
        result.skipReason = error instanceof Error ? error.message : String(error);
        this.log(`failed article: ${result.title} (${result.skipReason})`);
      }

      enriched.push(result);
      await sleep(220, 0.1);
    }

    return enriched;
  }
}

export function createDefaultAgentFetcher(
  log: (message: string) => void
): AgentFetcher {
  return new BrowserPageFetcher(log);
}
