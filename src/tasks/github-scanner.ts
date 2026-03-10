import fs from "node:fs";
import path from "node:path";

import { createOrResumeState, createRunId, ensureDir, saveTaskState } from "../lib/cache";
import {
  bringPageToFront,
  captureScreenshot,
  connectToTarget,
  evaluateInBrowser,
  getCurrentUrl,
  locateElement,
  navigateTo,
  openNewTab,
  sleep,
  waitForLoadEvent,
  waitForLocationChange,
  waitForNetworkIdle,
  waitForSelector
} from "../lib/cdp";
import { humanClick, humanScroll, scrollElementIntoView } from "../lib/humanizer";
import { LlmService } from "../lib/llm";
import { BaseTask } from "./BaseTask";
import type {
  GitHubPageSnapshot,
  GitHubRepo,
  GitHubScannerOptions,
  GitHubScannerState,
  ScoredRepo
} from "../types";

interface GitHubTaskResult {
  cachePath: string;
  reportPath: string;
  reposFound: number;
  winners: ScoredRepo[];
}

function formatStars(value: number | null): string {
  if (value === null) {
    return "unknown";
  }
  return new Intl.NumberFormat("en-US").format(value);
}

function mergeRepos(existing: GitHubRepo[], incoming: GitHubRepo[]): GitHubRepo[] {
  const merged = new Map<string, GitHubRepo>();
  for (const repo of [...existing, ...incoming]) {
    const current = merged.get(repo.url);
    if (!current) {
      merged.set(repo.url, repo);
      continue;
    }
    merged.set(repo.url, {
      ...current,
      ...repo,
      description: repo.description || current.description,
      tags: repo.tags.length > 0 ? repo.tags : current.tags,
      language: repo.language ?? current.language,
      stars: repo.stars ?? current.stars
    });
  }
  return Array.from(merged.values());
}

function defaultReportPath(runId: string): string {
  return path.join(process.cwd(), "reports", `github-report-${runId}.md`);
}

function buildInitialState(options: GitHubScannerOptions): GitHubScannerState {
  const runId = createRunId();
  return {
    task: "github",
    runId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
    input: {
      url: options.url,
      maxPages: options.pages,
      criteria: options.criteria
    },
    completedPages: 0,
    lastPageUrl: null,
    nextPageUrl: options.url,
    pages: [],
    repos: [],
    reportPath: path.resolve(options.reportPath ?? defaultReportPath(runId))
  };
}

export class GitHubScannerTask extends BaseTask<GitHubScannerOptions, GitHubTaskResult> {
  private readonly llm = new LlmService();

  private async waitForResults(client: unknown): Promise<void> {
    await waitForLoadEvent(client, 20_000);
    await waitForSelector(client, "main", { timeoutMs: 20_000 });
    await waitForNetworkIdle(client, { timeoutMs: 20_000, idleTimeMs: 900 });
  }

  private async scrapePage(client: unknown, pageNumber: number): Promise<GitHubPageSnapshot> {
    return evaluateInBrowser<GitHubPageSnapshot>(
      client,
      `(page) => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const toAbsolute = (href) => {
          if (!href) {
            return null;
          }
          try {
            return new URL(href, window.location.origin).toString();
          } catch {
            return null;
          }
        };
        const parseStars = (raw) => {
          const normalized = normalize(raw).toLowerCase().replace(/,/g, "");
          if (!normalized) {
            return null;
          }
          const match = normalized.match(/([0-9]+(?:\\.[0-9]+)?)([km])?/);
          if (!match) {
            return null;
          }
          const value = Number(match[1]);
          const suffix = match[2];
          if (!Number.isFinite(value)) {
            return null;
          }
          if (suffix === "k") {
            return Math.round(value * 1000);
          }
          if (suffix === "m") {
            return Math.round(value * 1000000);
          }
          return Math.round(value);
        };
        const repoPathPattern = /^\\/[^/]+\\/[^/]+\\/?$/;
        const root = document.querySelector('div[data-testid="results-list"]') || document.querySelector("main") || document.body;
        const repoAnchors = Array.from(root.querySelectorAll('a[href^="/"]'))
          .filter((anchor) => {
            const href = anchor.getAttribute("href") || "";
            if (!repoPathPattern.test(href)) {
              return false;
            }
            if (href.includes("/topics/")) {
              return false;
            }
            return true;
          });

        const seen = new Set();
        const repos = [];

        for (const anchor of repoAnchors) {
          const absoluteUrl = toAbsolute(anchor.getAttribute("href"));
          if (!absoluteUrl || seen.has(absoluteUrl)) {
            continue;
          }

          const url = new URL(absoluteUrl);
          const segments = url.pathname.split("/").filter(Boolean);
          if (segments.length !== 2) {
            continue;
          }

          const card =
            anchor.closest("li") ||
            anchor.closest("article") ||
            anchor.closest('[data-testid="results-list"] > div') ||
            anchor.parentElement;

          if (!card) {
            continue;
          }

          const owner = segments[0] || "";
          const name = segments[1] || "";
          const fullName = owner + "/" + name;
          const description =
            normalize(card.querySelector("p")?.textContent) ||
            normalize(
              Array.from(card.querySelectorAll("div,span"))
                .map((node) => normalize(node.textContent))
                .filter((text) => text.length > 20 && !text.includes(fullName))
                .sort((left, right) => right.length - left.length)[0]
            );
          const language =
            normalize(card.querySelector('[itemprop="programmingLanguage"]')?.textContent) || null;
          const tags = Array.from(card.querySelectorAll('a[href*="/topics/"]'))
            .map((tag) => normalize(tag.textContent))
            .filter(Boolean);
          const starText =
            card.querySelector('a[href$="/stargazers"], a[href*="/stargazers"]')?.textContent ||
            "";
          const stars = parseStars(starText);

          repos.push({
            key: fullName.toLowerCase(),
            owner,
            name,
            fullName,
            url: absoluteUrl,
            description,
            tags,
            language,
            stars,
            page: Number(page),
            sourceUrl: window.location.href,
            scrapedAt: new Date().toISOString()
          });
          seen.add(absoluteUrl);
        }

        const nextLink = Array.from(
          document.querySelectorAll(
            'a[rel="next"], a[aria-label*="Next" i], a[href*="page="], a[href*="after="]'
          )
        ).find((anchor) => {
          const text = normalize(anchor.textContent || anchor.getAttribute("aria-label"));
          const href = anchor.getAttribute("href") || "";
          const disabled =
            anchor.getAttribute("aria-disabled") === "true" ||
            anchor.closest('[aria-disabled="true"]');
          return !disabled && (text.toLowerCase().includes("next") || href.includes("page=") || href.includes("after="));
        });

        return {
          page: Number(page),
          url: window.location.href,
          nextPageUrl: nextLink ? toAbsolute(nextLink.getAttribute("href")) : null,
          scrapedAt: new Date().toISOString(),
          repos
        };
      }`,
      [pageNumber]
    );
  }

  private async scrapeWithRetry(client: unknown, pageNumber: number): Promise<GitHubPageSnapshot> {
    let lastError: unknown = undefined;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await humanScroll(client, { distancePx: 1_100 + attempt * 140 });
        const snapshot = await this.scrapePage(client, pageNumber);
        if (snapshot.repos.length > 0) {
          return snapshot;
        }
        throw new Error("no repositories were detected on the page");
      } catch (error) {
        lastError = error;
        const screenshotPath = `/tmp/github-scrape-failure-${Date.now()}-${attempt}.png`;
        await captureScreenshot(client, screenshotPath);
        if (attempt < 3) {
          await sleep(2_000, 0.05);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async goToNextPage(client: unknown, expectedNextUrl: string | null): Promise<boolean> {
    if (!expectedNextUrl) {
      return false;
    }

    const queries = ["a[rel=\"next\"]", "a[aria-label*=\"Next\"]", "Next"];

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await humanScroll(client, { distancePx: 1_600 + attempt * 160 });

        let selectedQuery: string | null = null;
        for (const query of queries) {
          await scrollElementIntoView(client, query);
          const located = await locateElement(client, query);
          if (located.status === "ok" && !located.disabled) {
            selectedQuery = query;
            break;
          }
        }

        if (!selectedQuery) {
          throw new Error("pagination next button was not found");
        }

        const currentUrl = await getCurrentUrl(client);
        await humanClick(client, selectedQuery);

        try {
          await waitForLocationChange(client, currentUrl, 12_000);
        } catch {
          const current = await getCurrentUrl(client);
          if (current !== expectedNextUrl && current === currentUrl) {
            throw new Error("next button click did not change the URL");
          }
        }

        await waitForLoadEvent(client, 20_000);
        await waitForNetworkIdle(client, { timeoutMs: 20_000, idleTimeMs: 900 });
        return true;
      } catch (error) {
        const screenshotPath = `/tmp/github-next-failure-${Date.now()}-${attempt}.png`;
        await captureScreenshot(client, screenshotPath);
        if (attempt < 3) {
          await sleep(2_000, 0.05);
          continue;
        }
        this.log(`pagination failed after 3 attempts: ${String(error)}`);
        return false;
      }
    }

    return false;
  }

  private renderReport(state: GitHubScannerState, winners: ScoredRepo[]): string {
    const lines: string[] = [
      "# Interesting GitHub Repositories",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Source Search URL: ${state.input.url}`,
      `Pages Scraped: ${state.completedPages}`,
      `Unique Repositories Collected: ${state.repos.length}`,
      `Criteria: ${state.input.criteria}`,
      "",
      "## Top Picks",
      ""
    ];

    winners.forEach((repo, index) => {
      lines.push(`${index + 1}. [${repo.fullName}](${repo.url})`);
      lines.push(`   Score: ${repo.score}/100`);
      lines.push(`   Why it stands out: ${repo.reasoning}`);
      lines.push(`   Language: ${repo.language ?? "unknown"} | Stars: ${formatStars(repo.stars)}`);
      lines.push(`   Tags: ${repo.tags.length > 0 ? repo.tags.join(", ") : "none listed"}`);
      lines.push(`   Description: ${repo.description || "No description scraped."}`);
      lines.push("");
    });

    return `${lines.join("\n").trim()}\n`;
  }

  async run(): Promise<GitHubTaskResult> {
    const { state, cachePath, resumed } = createOrResumeState<GitHubScannerState>({
      task: "github",
      resume: this.options.resume,
      cachePath: this.options.cachePath,
      cacheDir: this.options.cacheDir,
      createInitialState: () => buildInitialState(this.options)
    });

    state.updatedAt = new Date().toISOString();
    saveTaskState("github", cachePath, state);

    this.log(
      resumed
        ? `resuming GitHub run from ${cachePath} at page ${state.completedPages + 1}`
        : `starting GitHub run for ${state.input.url}`
    );

    const startUrl = state.completedPages > 0 ? state.nextPageUrl ?? state.lastPageUrl ?? state.input.url : state.input.url;
    const target = await openNewTab(startUrl);
    const client = await connectToTarget(target);

    try {
      await bringPageToFront(client);

      let currentPage = state.completedPages + 1;
      let currentUrl = startUrl;

      while (currentUrl && currentPage <= state.input.maxPages) {
        await navigateTo(client, currentUrl, { timeoutMs: 25_000, waitForIdle: true });
        await this.waitForResults(client);

        const snapshot = await this.scrapeWithRetry(client, currentPage);
        state.pages = [...state.pages.filter((page) => page.page !== snapshot.page), snapshot].sort(
          (left, right) => left.page - right.page
        );
        state.repos = mergeRepos(state.repos, snapshot.repos);
        state.completedPages = currentPage;
        state.lastPageUrl = snapshot.url;
        state.nextPageUrl = snapshot.nextPageUrl;
        state.updatedAt = new Date().toISOString();
        state.status = "running";
        saveTaskState("github", cachePath, state);

        this.log(
          `scraped page ${currentPage}/${state.input.maxPages}: ${snapshot.repos.length} repos, ${state.repos.length} unique total`
        );

        if (!snapshot.nextPageUrl || currentPage >= state.input.maxPages) {
          break;
        }

        const advanced = await this.goToNextPage(client, snapshot.nextPageUrl);
        if (!advanced) {
          break;
        }

        currentPage += 1;
        currentUrl = snapshot.nextPageUrl;
      }

      const winners = await this.llm.evaluateRepositories(state.repos, state.input.criteria);
      const reportBody = this.renderReport(state, winners);
      ensureDir(path.dirname(state.reportPath));
      fs.writeFileSync(state.reportPath, reportBody, "utf8");

      state.status = "completed";
      state.updatedAt = new Date().toISOString();
      saveTaskState("github", cachePath, state);

      return {
        cachePath,
        reportPath: state.reportPath,
        reposFound: state.repos.length,
        winners
      };
    } catch (error) {
      state.status = "failed";
      state.updatedAt = new Date().toISOString();
      saveTaskState("github", cachePath, state);
      throw error;
    } finally {
      await client.close();
    }
  }
}
