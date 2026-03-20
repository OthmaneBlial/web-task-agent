import "dotenv/config";

import path from "node:path";

import { Command } from "commander";

import { enqueueQueuedAgentJob, listQueuedJobs } from "./lib/job-queue";
import { createManagementServer } from "./server/management-server";
import { AgentRunnerTask } from "./tasks/agent-runner";
import { GitHubScannerTask } from "./tasks/github-scanner";
import { PlayStoreAnalyzerTask } from "./tasks/playstore-analyzer";
import { QueueWorkerTask } from "./tasks/queue-worker";
import {
  buildWorkflowRunOptions,
  getWorkflowTemplate,
  listWorkflowTemplates
} from "./workflows";

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
      console.log(`Job ID: ${result.jobId}`);
      console.log(`Job DB: ${result.databasePath}`);
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
      console.log(`Job ID: ${result.jobId}`);
      console.log(`Job DB: ${result.databasePath}`);
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
    .option(
      "--fetch-batch-size <number>",
      "How many result pages to fetch before checkpointing progress",
      (value) => parsePositiveInteger(value, "fetch-batch-size"),
      5
    )
    .option(
      "--max-runtime-hours <number>",
      "Soft runtime budget for a long-running job execution window",
      (value) => parsePositiveInteger(value, "max-runtime-hours"),
      6
    )
    .option(
      "--lease-ttl-minutes <number>",
      "Execution lease TTL before a stale run becomes recoverable",
      (value) => parsePositiveInteger(value, "lease-ttl-minutes"),
      15
    )
    .action(async (instruction, options) => {
      const task = new AgentRunnerTask({
        instruction: normalizeText(String(instruction)),
        resume: Boolean(options.resume),
        cachePath: options.cache ? path.resolve(String(options.cache)) : undefined,
        reportPath: options.report ? path.resolve(String(options.report)) : undefined,
        memoryPath: options.memory ? path.resolve(String(options.memory)) : undefined,
        maxQueries: Number(options.maxQueries),
        maxResultsPerQuery: Number(options.maxResults),
        fetchBatchSize: Number(options.fetchBatchSize),
        maxRuntimeHours: Number(options.maxRuntimeHours),
        leaseTtlMinutes: Number(options.leaseTtlMinutes)
      });

      const result = await task.run();
      console.log(`Agent job update.`);
      console.log(`Status: ${result.status}`);
      console.log(`Estimated time: ${result.estimatedMinutes} minutes`);
      console.log(`Job ID: ${result.jobId}`);
      console.log(`Job DB: ${result.databasePath}`);
      console.log(`Cache: ${result.cachePath}`);
      console.log(`Report: ${result.reportPath}`);
      console.log(`Artifacts: ${result.artifactDir}`);
    });

  agent
    .command("enqueue <instruction>")
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
    .option(
      "--fetch-batch-size <number>",
      "How many result pages to fetch before checkpointing progress",
      (value) => parsePositiveInteger(value, "fetch-batch-size"),
      5
    )
    .option(
      "--max-runtime-hours <number>",
      "Soft runtime budget for a long-running job execution window",
      (value) => parsePositiveInteger(value, "max-runtime-hours"),
      6
    )
    .option(
      "--lease-ttl-minutes <number>",
      "Execution lease TTL before a stale run becomes recoverable",
      (value) => parsePositiveInteger(value, "lease-ttl-minutes"),
      15
    )
    .option(
      "--delay-seconds <number>",
      "Delay before the queued job becomes runnable",
      (value) => parsePositiveInteger(value, "delay-seconds"),
      0
    )
    .action((instruction, options) => {
      const queued = enqueueQueuedAgentJob({
        payload: {
          taskType: "agent",
          mode: "agent",
          label: normalizeText(String(instruction)).slice(0, 120),
          options: {
            instruction: normalizeText(String(instruction)),
            resume: false,
            cachePath: options.cache ? path.resolve(String(options.cache)) : undefined,
            reportPath: options.report ? path.resolve(String(options.report)) : undefined,
            memoryPath: options.memory ? path.resolve(String(options.memory)) : undefined,
            maxQueries: Number(options.maxQueries),
            maxResultsPerQuery: Number(options.maxResults),
            fetchBatchSize: Number(options.fetchBatchSize),
            maxRuntimeHours: Number(options.maxRuntimeHours),
            leaseTtlMinutes: Number(options.leaseTtlMinutes)
          }
        },
        delaySeconds: Number(options.delaySeconds)
      });

      console.log(`Queued agent job.`);
      console.log(`Queue ID: ${queued.queueId}`);
      console.log(`Job DB: ${queued.databasePath}`);
      console.log(`Cache: ${queued.cachePath}`);
      console.log(`Report: ${queued.reportPath}`);
    });

  const workflow = program
    .command("workflow")
    .description("Run opinionated long-form research templates");

  workflow
    .command("list")
    .description("List the built-in workflow templates")
    .action(() => {
      const templates = listWorkflowTemplates();
      console.log("Available workflows:");
      for (const template of templates) {
        console.log(`- ${template.id}: ${template.description}`);
      }
    });

  workflow
    .command("run <template>")
    .requiredOption("--topic <text>", "Topic, niche, or seed question to research")
    .option("--audience <text>", "Optional audience to optimize the report for")
    .option("--context <text>", "Optional extra instructions or business context")
    .option("--resume", "Resume the latest cached workflow run")
    .option("--cache <path>", "Use a specific cache file")
    .option("--report <path>", "Write the Markdown report to a specific path")
    .option("--memory <path>", "Load product context from a Markdown or text file")
    .option(
      "--max-queries <number>",
      "Override the template query budget",
      (value) => parsePositiveInteger(value, "max-queries")
    )
    .option(
      "--max-results <number>",
      "Override the template result budget per query",
      (value) => parsePositiveInteger(value, "max-results")
    )
    .option(
      "--fetch-batch-size <number>",
      "Override the template fetch batch size",
      (value) => parsePositiveInteger(value, "fetch-batch-size")
    )
    .option(
      "--max-runtime-hours <number>",
      "Override the template runtime budget",
      (value) => parsePositiveInteger(value, "max-runtime-hours")
    )
    .option(
      "--lease-ttl-minutes <number>",
      "Execution lease TTL before a stale run becomes recoverable",
      (value) => parsePositiveInteger(value, "lease-ttl-minutes")
    )
    .action(async (templateId, options) => {
      const template = getWorkflowTemplate(String(templateId));
      if (!template) {
        throw new Error(`Unknown workflow template: ${templateId}`);
      }

      const task = new AgentRunnerTask(
        buildWorkflowRunOptions({
          templateId: template.id,
          topic: normalizeText(String(options.topic)),
          audience: options.audience ? normalizeText(String(options.audience)) : null,
          context: options.context ? normalizeText(String(options.context)) : null,
          overrides: {
            resume: Boolean(options.resume),
            cachePath: options.cache ? path.resolve(String(options.cache)) : undefined,
            reportPath: options.report ? path.resolve(String(options.report)) : undefined,
            memoryPath: options.memory ? path.resolve(String(options.memory)) : undefined,
            maxQueries:
              options.maxQueries !== undefined ? Number(options.maxQueries) : undefined,
            maxResultsPerQuery:
              options.maxResults !== undefined ? Number(options.maxResults) : undefined,
            fetchBatchSize:
              options.fetchBatchSize !== undefined ? Number(options.fetchBatchSize) : undefined,
            maxRuntimeHours:
              options.maxRuntimeHours !== undefined ? Number(options.maxRuntimeHours) : undefined,
            leaseTtlMinutes:
              options.leaseTtlMinutes !== undefined ? Number(options.leaseTtlMinutes) : undefined
          }
        })
      );

      const result = await task.run();
      console.log(`Workflow job update.`);
      console.log(`Template: ${template.id}`);
      console.log(`Status: ${result.status}`);
      console.log(`Estimated time: ${result.estimatedMinutes} minutes`);
      console.log(`Job ID: ${result.jobId}`);
      console.log(`Job DB: ${result.databasePath}`);
      console.log(`Cache: ${result.cachePath}`);
      console.log(`Report: ${result.reportPath}`);
      console.log(`Artifacts: ${result.artifactDir}`);
    });

  workflow
    .command("enqueue <template>")
    .requiredOption("--topic <text>", "Topic, niche, or seed question to research")
    .option("--audience <text>", "Optional audience to optimize the report for")
    .option("--context <text>", "Optional extra instructions or business context")
    .option("--cache <path>", "Use a specific cache file")
    .option("--report <path>", "Write the Markdown report to a specific path")
    .option("--memory <path>", "Load product context from a Markdown or text file")
    .option(
      "--max-queries <number>",
      "Override the template query budget",
      (value) => parsePositiveInteger(value, "max-queries")
    )
    .option(
      "--max-results <number>",
      "Override the template result budget per query",
      (value) => parsePositiveInteger(value, "max-results")
    )
    .option(
      "--fetch-batch-size <number>",
      "Override the template fetch batch size",
      (value) => parsePositiveInteger(value, "fetch-batch-size")
    )
    .option(
      "--max-runtime-hours <number>",
      "Override the template runtime budget",
      (value) => parsePositiveInteger(value, "max-runtime-hours")
    )
    .option(
      "--lease-ttl-minutes <number>",
      "Execution lease TTL before a stale run becomes recoverable",
      (value) => parsePositiveInteger(value, "lease-ttl-minutes")
    )
    .option(
      "--delay-seconds <number>",
      "Delay before the queued job becomes runnable",
      (value) => parsePositiveInteger(value, "delay-seconds"),
      0
    )
    .action((templateId, options) => {
      const template = getWorkflowTemplate(String(templateId));
      if (!template) {
        throw new Error(`Unknown workflow template: ${templateId}`);
      }

      const payloadOptions = buildWorkflowRunOptions({
        templateId: template.id,
        topic: normalizeText(String(options.topic)),
        audience: options.audience ? normalizeText(String(options.audience)) : null,
        context: options.context ? normalizeText(String(options.context)) : null,
        overrides: {
          resume: false,
          cachePath: options.cache ? path.resolve(String(options.cache)) : undefined,
          reportPath: options.report ? path.resolve(String(options.report)) : undefined,
          memoryPath: options.memory ? path.resolve(String(options.memory)) : undefined,
          maxQueries:
            options.maxQueries !== undefined ? Number(options.maxQueries) : undefined,
          maxResultsPerQuery:
            options.maxResults !== undefined ? Number(options.maxResults) : undefined,
          fetchBatchSize:
            options.fetchBatchSize !== undefined ? Number(options.fetchBatchSize) : undefined,
          maxRuntimeHours:
            options.maxRuntimeHours !== undefined ? Number(options.maxRuntimeHours) : undefined,
          leaseTtlMinutes:
            options.leaseTtlMinutes !== undefined ? Number(options.leaseTtlMinutes) : undefined
        }
      });

      const queued = enqueueQueuedAgentJob({
        payload: {
          taskType: "agent",
          mode: "workflow",
          label: payloadOptions.jobTitle ?? template.title,
          options: payloadOptions
        },
        delaySeconds: Number(options.delaySeconds)
      });

      console.log(`Queued workflow job.`);
      console.log(`Template: ${template.id}`);
      console.log(`Queue ID: ${queued.queueId}`);
      console.log(`Job DB: ${queued.databasePath}`);
      console.log(`Cache: ${queued.cachePath}`);
      console.log(`Report: ${queued.reportPath}`);
    });

  const queue = program
    .command("queue")
    .description("Inspect the long-running job queue");

  queue
    .command("list")
    .option("--status <status>", "Filter by queue status")
    .action((options) => {
      const queuedJobs = listQueuedJobs({
        status: options.status
      });
      if (queuedJobs.length === 0) {
        console.log("No queued jobs.");
        return;
      }

      for (const queuedJob of queuedJobs) {
        console.log(
          `${queuedJob.queueId} ${queuedJob.status} attempts=${queuedJob.attempts}/${queuedJob.maxAttempts} ${queuedJob.label}`
        );
      }
    });

  program
    .command("worker")
    .description("Run a local worker that processes queued jobs")
    .command("run")
    .option("--once", "Process at most one queued job and exit")
    .option(
      "--poll-interval-seconds <number>",
      "How long an idle worker waits before polling again",
      (value) => parsePositiveInteger(value, "poll-interval-seconds"),
      15
    )
    .option(
      "--queue-lease-minutes <number>",
      "Queue lease TTL while a worker owns a queued job",
      (value) => parsePositiveInteger(value, "queue-lease-minutes"),
      15
    )
    .action(async (options) => {
      const result = await new QueueWorkerTask({
        once: Boolean(options.once),
        pollIntervalSeconds: Number(options.pollIntervalSeconds),
        queueLeaseMinutes: Number(options.queueLeaseMinutes)
      }).run();

      console.log(`Worker run complete.`);
      console.log(`Worker ID: ${result.workerId}`);
      console.log(`Recovered queued jobs: ${result.recoveredJobs}`);
      console.log(`Processed queued jobs: ${result.processedJobs}`);
    });

  program
    .command("server")
    .description("Run the local management API and HTML dashboard")
    .command("run")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .option(
      "--port <number>",
      "Port to bind",
      (value) => parsePositiveInteger(value, "port"),
      4317
    )
    .action(async (options) => {
      const server = createManagementServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(Number(options.port), String(options.host), () => resolve());
      });

      console.log(`Management server running.`);
      console.log(`URL: http://${String(options.host)}:${Number(options.port)}`);

      await new Promise<void>(() => {
        // Keep the process alive until it is interrupted.
      });
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
