import "dotenv/config";

import path from "node:path";

import { Command } from "commander";

import { GitHubScannerTask } from "./tasks/github-scanner";
import { PlayStoreAnalyzerTask } from "./tasks/playstore-analyzer";

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("web-task-agent")
    .description("Intelligent browser task automation using a real Chrome profile over CDP")
    .showHelpAfterError();

  program
    .command("github")
    .requiredOption("--url <url>", "GitHub search URL to scan")
    .option("--pages <number>", "Maximum number of pages to scrape", (value) => parsePositiveInteger(value, "pages"), 10)
    .requiredOption("--criteria <text>", "Claude evaluation criteria")
    .option("--resume", "Resume the latest cached GitHub run")
    .option("--cache <path>", "Use a specific cache file")
    .option("--report <path>", "Write the Markdown report to a specific path")
    .action(async (options) => {
      const task = new GitHubScannerTask({
        url: String(options.url),
        pages: Number(options.pages),
        criteria: String(options.criteria),
        resume: Boolean(options.resume),
        cachePath: options.cache ? path.resolve(String(options.cache)) : undefined,
        reportPath: options.report ? path.resolve(String(options.report)) : undefined
      });

      const result = await task.run();
      console.log(`GitHub scan complete.`);
      console.log(`Cache: ${result.cachePath}`);
      console.log(`Report: ${result.reportPath}`);
      console.log(`Repositories found: ${result.reposFound}`);
      console.log(`Top picks: ${result.winners.length}`);
    });

  program
    .command("playstore")
    .requiredOption("--query <query>", "Google Play search keyword")
    .option(
      "--analyze-top <number>",
      "Number of apps to analyze in detail",
      (value) => parsePositiveInteger(value, "analyze-top"),
      5
    )
    .option("--resume", "Resume the latest cached Play Store run")
    .option("--cache <path>", "Use a specific cache file")
    .option("--report <path>", "Write the Markdown report to a specific path")
    .action(async (options) => {
      const task = new PlayStoreAnalyzerTask({
        query: String(options.query),
        analyzeTop: Number(options.analyzeTop),
        resume: Boolean(options.resume),
        cachePath: options.cache ? path.resolve(String(options.cache)) : undefined,
        reportPath: options.report ? path.resolve(String(options.report)) : undefined
      });

      const result = await task.run();
      console.log(`Play Store analysis complete.`);
      console.log(`Cache: ${result.cachePath}`);
      console.log(`Report: ${result.reportPath}`);
      console.log(`Search results found: ${result.summariesFound}`);
      console.log(`Apps analyzed: ${result.analyzedApps}`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
