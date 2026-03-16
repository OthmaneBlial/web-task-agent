import "dotenv/config";

import path from "node:path";

import { Command } from "commander";

import { AgentRunnerTask } from "./tasks/agent-runner";
import { GitHubScannerTask } from "./tasks/github-scanner";
import { PlayStoreAnalyzerTask } from "./tasks/playstore-analyzer";

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("web-task-agent")
    .description("Intelligent browser task automation using Lightpanda headless browser over CDP")
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

  const agent = program
    .command("agent")
    .description("General-purpose browser agent jobs with planning, research, drafts, and reports");

  agent
    .command("run <instruction>")
    .option("--resume", "Resume the latest cached agent run")
    .option("--cache <path>", "Use a specific cache file")
    .option("--report <path>", "Write the Markdown report to a specific path")
    .option("--memory <path>", "Load product context from a Markdown or text file")
    .option(
      "--max-queries <number>",
      "Maximum number of research queries to execute",
      (value) => parsePositiveInteger(value, "max-queries"),
      3
    )
    .option(
      "--max-results <number>",
      "Maximum search results to capture per query",
      (value) => parsePositiveInteger(value, "max-results"),
      5
    )
    .action(async (instruction, options) => {
      const task = new AgentRunnerTask({
        instruction: normalizeText(String(instruction)),
        resume: Boolean(options.resume),
        cachePath: options.cache ? path.resolve(String(options.cache)) : undefined,
        reportPath: options.report ? path.resolve(String(options.report)) : undefined,
        memoryPath: options.memory ? path.resolve(String(options.memory)) : undefined,
        maxQueries: Number(options.maxQueries),
        maxResultsPerQuery: Number(options.maxResults)
      });

      const result = await task.run();
      console.log(`Agent job update.`);
      console.log(`Status: ${result.status}`);
      console.log(`Estimated time: ${result.estimatedMinutes} minutes`);
      console.log(`Cache: ${result.cachePath}`);
      console.log(`Report: ${result.reportPath}`);
      console.log(`Artifacts: ${result.artifactDir}`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
