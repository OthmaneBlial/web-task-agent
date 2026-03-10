import fs from "node:fs";
import path from "node:path";

import { createOrResumeState, createRunId, ensureDir, saveTaskState } from "../lib/cache";
import {
  bringPageToFront,
  captureScreenshot,
  closeTarget,
  connectToTarget,
  evaluateInBrowser,
  listPageTargets,
  openNewTab,
  sleep,
  waitForLoadEvent,
  waitForAnySelector,
  waitForNetworkIdle,
  waitForSelector
} from "../lib/cdp";
import { humanClick, humanScroll } from "../lib/humanizer";
import { LlmService } from "../lib/llm";
import { BaseTask } from "./BaseTask";
import type {
  CDPClient,
  MarketInsightReport,
  PageTarget,
  PlayStoreAnalyzerOptions,
  PlayStoreAnalyzerState,
  PlayStoreAppDetail,
  PlayStoreAppSummary
} from "../types";

interface PlayStoreTaskResult {
  cachePath: string;
  reportPath: string;
  summariesFound: number;
  analyzedApps: number;
}

function buildSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://play.google.com/store/search?q=${encoded}&c=apps&hl=en&gl=us`;
}

function defaultReportPath(runId: string): string {
  return path.join(process.cwd(), "reports", `playstore-report-${runId}.md`);
}

function buildInitialState(options: PlayStoreAnalyzerOptions): PlayStoreAnalyzerState {
  const runId = createRunId();
  return {
    task: "playstore",
    runId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
    input: {
      query: options.query,
      analyzeTop: options.analyzeTop
    },
    searchUrl: buildSearchUrl(options.query),
    summaries: [],
    analyzedApps: [],
    reportPath: path.resolve(options.reportPath ?? defaultReportPath(runId))
  };
}

function mergeSummaries(existing: PlayStoreAppSummary[], incoming: PlayStoreAppSummary[]): PlayStoreAppSummary[] {
  const map = new Map<string, PlayStoreAppSummary>();
  for (const summary of [...existing, ...incoming]) {
    map.set(summary.key, summary);
  }
  return Array.from(map.values());
}

function mergeDetails(existing: PlayStoreAppDetail[], incoming: PlayStoreAppDetail): PlayStoreAppDetail[] {
  const map = new Map(existing.map((app) => [app.key, app]));
  map.set(incoming.key, incoming);
  return Array.from(map.values());
}

function renderReport(
  keyword: string,
  state: PlayStoreAnalyzerState,
  report: MarketInsightReport
): string {
  const lines: string[] = [
    "# Google Play Market Insight Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Keyword: ${keyword}`,
    `Apps Scraped: ${state.summaries.length}`,
    `Apps Analyzed In Detail: ${state.analyzedApps.length}`,
    "",
    "## Executive Summary",
    "",
    report.executiveSummary,
    "",
    "## Common Features",
    ""
  ];

  for (const item of report.commonFeatures) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## Missing Features", "");
  for (const item of report.missingFeatures) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## Average Sentiment", "", report.averageSentiment, "", "## Competitor Positioning", "");
  for (const item of report.competitorPositioning) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## Standout Apps", "");
  for (const item of report.standoutApps) {
    lines.push(`- ${item}`);
  }

  return `${lines.join("\n").trim()}\n`;
}

export class PlayStoreAnalyzerTask extends BaseTask<PlayStoreAnalyzerOptions, PlayStoreTaskResult> {
  private readonly llm = new LlmService();

  private async waitForStoreSearchResults(client: CDPClient): Promise<void> {
    await waitForLoadEvent(client, 20_000);
    await waitForAnySelector(
      client,
      ['a[href*="/store/apps/details?id="]', '[role="listitem"]'],
      { timeoutMs: 20_000 }
    );
    await this.waitForAppLinkCount(client, 1, 12_000);
    await this.softWaitForNetworkIdle(client);
  }

  private async waitForStoreDetail(client: CDPClient): Promise<void> {
    await waitForLoadEvent(client, 20_000);
    await waitForAnySelector(
      client,
      ["h1", '[data-g-id="description"]', 'meta[name="description"]', '[aria-label*="stars" i]'],
      { timeoutMs: 20_000 }
    );
    await this.softWaitForNetworkIdle(client);
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

  private async waitForAppLinkCount(
    client: CDPClient,
    minimum: number,
    timeoutMs: number
  ): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const count = await evaluateInBrowser<number>(
        client,
        `() => document.querySelectorAll('a[href*="/store/apps/details?id="]').length`
      );
      if (count >= minimum) {
        return;
      }
      await sleep(250, 0.1);
    }

    throw new Error(`timed out waiting for at least ${minimum} Play Store app links`);
  }

  private buildAppSelector(summary: PlayStoreAppSummary): string {
    if (!summary.appId) {
      throw new Error(`cannot build selector for app without appId: ${summary.name}`);
    }
    return `a[href*="id=${summary.appId}"]`;
  }

  private async waitForNewTarget(
    existingTargetIds: Set<string>,
    appId: string,
    timeoutMs: number = 12_000
  ): Promise<PageTarget> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const targets = await listPageTargets();
      const created = targets.find(
        (target) =>
          !existingTargetIds.has(target.id) &&
          (target.url.includes(appId) || target.title.toLowerCase().includes(appId.toLowerCase()))
      );
      if (created) {
        return created;
      }

      const anyCreated = targets.find((target) => !existingTargetIds.has(target.id));
      if (anyCreated) {
        return anyCreated;
      }

      await sleep(150, 0.1);
    }

    throw new Error(`timed out waiting for a new detail tab for ${appId}`);
  }

  private async openAppInDetailTab(
    searchClient: CDPClient,
    summary: PlayStoreAppSummary
  ): Promise<{ target: PageTarget; client: CDPClient }> {
    const beforeTargetIds = new Set((await listPageTargets()).map((target) => target.id));
    const selector = this.buildAppSelector(summary);

    await humanScroll(searchClient, { distancePx: 700, tickCount: 5 });
    await humanClick(searchClient, selector, { modifiers: 2 });

    const detailTarget = await this.waitForNewTarget(beforeTargetIds, summary.appId ?? summary.key);
    const detailClient = await connectToTarget(detailTarget);
    await bringPageToFront(detailClient);

    return { target: detailTarget, client: detailClient };
  }

  private async scrapeSearchResults(client: unknown): Promise<PlayStoreAppSummary[]> {
    return evaluateInBrowser<PlayStoreAppSummary[]>(
      client,
      `() => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const parseRating = (raw) => {
          const match = normalize(raw).match(/([0-9]+(?:\\.[0-9]+)?)/);
          return match ? Number(match[1]) : null;
        };
        const anchors = Array.from(
          document.querySelectorAll('a[href*="/store/apps/details?id="]')
        );
        const results = new Map();

        for (const anchor of anchors) {
          const href = anchor.getAttribute("href");
          if (!href) {
            continue;
          }

          const absolute = new URL(href, window.location.origin).toString();
          const appId = new URL(absolute).searchParams.get("id");
          if (!appId || results.has(appId)) {
            continue;
          }

          const card =
            anchor.closest('[role="listitem"]') ||
            anchor.closest("div[data-item-id]") ||
            anchor.closest("div") ||
            anchor.parentElement;
          if (!card) {
            continue;
          }

          const textBlocks = Array.from(card.querySelectorAll("span,div,a"))
            .map((node) => normalize(node.textContent))
            .filter(Boolean);
          const name =
            normalize(card.querySelector("span.DdYX5")?.textContent) ||
            normalize(anchor.getAttribute("aria-label")) ||
            normalize(card.querySelector('[title]')?.getAttribute("title")) ||
            normalize(card.querySelector('div[role="heading"]')?.textContent) ||
            textBlocks[0] ||
            appId;
          const developer =
            normalize(card.querySelector("span.wMUdtb")?.textContent) ||
            textBlocks.find(
              (text) =>
                text !== name &&
                !/^[0-9.]+$/.test(text) &&
                !/star/i.test(text) &&
                !/Contains ads/i.test(text) &&
                !/In-app purchases/i.test(text)
            ) || "";
          const ratingSource =
            card.querySelector('[aria-label*="star" i]')?.getAttribute("aria-label") ||
            card.querySelector("span.w2kbF")?.textContent ||
            textBlocks.find((text) => /[0-9]\\.[0-9]/.test(text)) ||
            "";
          const ratingCount =
            textBlocks.find((text) => /reviews|ratings|k\\)|m\\)/i.test(text)) || null;
          const iconUrl =
            card.querySelector("img")?.getAttribute("src") ||
            card.querySelector("img")?.getAttribute("data-src") ||
            null;

          results.set(appId, {
            key: appId,
            appId,
            name,
            developer,
            rating: parseRating(ratingSource),
            ratingCount,
            url: absolute,
            iconUrl
          });
        }

        return Array.from(results.values());
      }`
    );
  }

  private async scrapeDetailPage(
    client: unknown,
    summary: PlayStoreAppSummary
  ): Promise<PlayStoreAppDetail> {
    return evaluateInBrowser<PlayStoreAppDetail>(
      client,
      `(input) => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const parseRating = (raw) => {
          const match = normalize(raw).match(/([0-9]+(?:\\.[0-9]+)?)/);
          return match ? Number(match[1]) : null;
        };
        const name = normalize(document.querySelector("h1")?.textContent) || input.name;
        const developer =
          normalize(
            document.querySelector('a[href*="/store/apps/dev"], a[href*="/store/apps/developer"]')
              ?.textContent
          ) || input.developer;
        const description =
          normalize(document.querySelector('[data-g-id="description"]')?.textContent) ||
          normalize(document.querySelector('div[itemprop="description"]')?.textContent) ||
          normalize(document.querySelector('meta[name="description"]')?.getAttribute("content")) ||
          "";
        const categories = Array.from(
          document.querySelectorAll('a[href*="/store/apps/category"], a[href*="/store/search?q="]')
        )
          .map((element) => normalize(element.textContent))
          .filter((text) => text.length > 1)
          .slice(0, 8);
        const reviewSummaries = Array.from(document.querySelectorAll('[data-review-id], [class*="review"]'))
          .map((element) => normalize(element.textContent))
          .filter((text) => text.length >= 40)
          .slice(0, 6);
        const ratingSource =
          document.querySelector('[aria-label*="star" i]')?.getAttribute("aria-label") ||
          document.querySelector('div[itemprop="starRating"]')?.textContent ||
          "";

        return {
          ...input,
          name,
          developer,
          rating: parseRating(ratingSource) ?? input.rating,
          description,
          categories,
          reviewSummaries,
          scrapedAt: new Date().toISOString()
        };
      }`,
      [summary]
    );
  }

  async run(): Promise<PlayStoreTaskResult> {
    const { state, cachePath, resumed } = createOrResumeState<PlayStoreAnalyzerState>({
      task: "playstore",
      resume: this.options.resume,
      cachePath: this.options.cachePath,
      cacheDir: this.options.cacheDir,
      createInitialState: () => buildInitialState(this.options)
    });

    state.updatedAt = new Date().toISOString();
    saveTaskState("playstore", cachePath, state);

    this.log(
      resumed
        ? `resuming Play Store run from ${cachePath}`
        : `starting Play Store run for query "${state.input.query}"`
    );

    const target = await openNewTab(state.searchUrl);
    const client = await connectToTarget(target);

    try {
      await bringPageToFront(client);
      await this.waitForStoreSearchResults(client);

      let summaries = state.summaries;
      for (let pass = 0; pass < 4 && summaries.length < state.input.analyzeTop; pass += 1) {
        await humanScroll(client, { distancePx: 1_800 + pass * 240 });
        await this.softWaitForNetworkIdle(client);
        summaries = mergeSummaries(summaries, await this.scrapeSearchResults(client));
      }

      state.summaries = summaries;
      state.updatedAt = new Date().toISOString();
      saveTaskState("playstore", cachePath, state);

      const targets = state.summaries.slice(0, state.input.analyzeTop);
      const analyzedKeys = new Set(state.analyzedApps.map((app) => app.key));

      for (const summary of targets) {
        if (analyzedKeys.has(summary.key)) {
          continue;
        }

        let detailTarget: PageTarget | null = null;
        let detailClient: CDPClient | null = null;
        try {
          await bringPageToFront(client);
          const detailSession = await this.openAppInDetailTab(client, summary);
          detailTarget = detailSession.target;
          detailClient = detailSession.client;
          await bringPageToFront(detailClient);
          await this.waitForStoreDetail(detailClient);
          await humanScroll(detailClient, { distancePx: 1_400 });
          await humanScroll(detailClient, { distancePx: 1_100 });
          const detail = await this.scrapeDetailPage(detailClient, summary);
          state.analyzedApps = mergeDetails(state.analyzedApps, detail);
          state.updatedAt = new Date().toISOString();
          saveTaskState("playstore", cachePath, state);
          analyzedKeys.add(summary.key);
          this.log(`analyzed ${summary.name}`);
        } catch (error) {
          const screenshotPath = `/tmp/playstore-detail-failure-${Date.now()}-${summary.key}.png`;
          await captureScreenshot(detailClient ?? client, screenshotPath);
          this.log(`failed to analyze ${summary.name}: ${String(error)} (screenshot: ${screenshotPath})`);
        } finally {
          if (detailClient) {
            await detailClient.close();
          }
          if (detailTarget) {
            await closeTarget(detailTarget);
          }
          await bringPageToFront(client);
          await this.softWaitForNetworkIdle(client);
        }
      }

      const insights = await this.llm.generatePlayStoreInsights(state.analyzedApps, state.input.query);
      ensureDir(path.dirname(state.reportPath));
      fs.writeFileSync(state.reportPath, renderReport(state.input.query, state, insights), "utf8");

      state.status = "completed";
      state.updatedAt = new Date().toISOString();
      saveTaskState("playstore", cachePath, state);

      return {
        cachePath,
        reportPath: state.reportPath,
        summariesFound: state.summaries.length,
        analyzedApps: state.analyzedApps.length
      };
    } catch (error) {
      const screenshotPath = `/tmp/playstore-failure-${Date.now()}.png`;
      await captureScreenshot(client, screenshotPath);
      state.status = "failed";
      state.updatedAt = new Date().toISOString();
      saveTaskState("playstore", cachePath, state);
      throw error;
    } finally {
      await client.close();
    }
  }
}
