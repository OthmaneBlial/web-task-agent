import "dotenv/config";

import path from "node:path";

import { Command } from "commander";

import { requestAgentJobControl, resumeAgentJob, rerunAgentJob } from "./lib/job-operations";
import { controlQueuedJob, enqueueQueuedAgentJob, getQueuedJob, listQueuedJobs } from "./lib/job-queue";
import { listJobRunEvents } from "./lib/job-store";
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

function parseDurationMinutes(value: string, label: string): number {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$/
  );

  if (!match) {
    throw new Error(
      `${label} must look like 30m, 30 minutes, 1h, or 2 hours`
    );
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than 0`);
  }

  const unit = match[2] ?? "minutes";
  const minutes =
    unit.startsWith("h") ? Math.round(amount * 60) : Math.round(amount);

  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error(`${label} must resolve to at least 1 minute`);
  }

  return minutes;
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
      (value) => parsePositiveInteger(value, "max-queries")
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
      "--research-duration <duration>",
      "Keep expanding research until this time budget is consumed, for example 30m or 2h",
      (value) => parseDurationMinutes(value, "research-duration")
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
        maxQueries:
          options.maxQueries !== undefined ? Number(options.maxQueries) : undefined,
        maxResultsPerQuery: Number(options.maxResults),
        fetchBatchSize: Number(options.fetchBatchSize),
        researchDurationMinutes:
          options.researchDuration !== undefined ? Number(options.researchDuration) : undefined,
        maxRuntimeHours: Number(options.maxRuntimeHours),
        leaseTtlMinutes: Number(options.leaseTtlMinutes)
      });

      const result = await task.run();
      console.log(`Agent job update.`);
      console.log(`Status: ${result.status}`);
      console.log(`Expected time: ${result.expectedMinutes} minutes`);
      console.log(`Actual runtime: ${result.elapsedMinutes} minutes`);
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
      (value) => parsePositiveInteger(value, "max-queries")
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
      "--research-duration <duration>",
      "Keep expanding research until this time budget is consumed, for example 30m or 2h",
      (value) => parseDurationMinutes(value, "research-duration")
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
            maxQueries:
              options.maxQueries !== undefined ? Number(options.maxQueries) : undefined,
            maxResultsPerQuery: Number(options.maxResults),
            fetchBatchSize: Number(options.fetchBatchSize),
            researchDurationMinutes:
              options.researchDuration !== undefined ? Number(options.researchDuration) : undefined,
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
        console.log(`  Presets: ${template.presets.map((preset) => preset.id).join(", ")}`);
        console.log(`  Example: ${template.examplePath}`);
      }
    });

  workflow
    .command("run <template>")
    .requiredOption("--topic <text>", "Topic, niche, or seed question to research")
    .option("--audience <text>", "Optional audience to optimize the report for")
    .option("--context <text>", "Optional extra instructions or business context")
    .option("--preset <name>", "Workflow preset: fast, standard, or deep", "standard")
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
      "--research-duration <duration>",
      "Override the template research duration budget, for example 30m or 2h",
      (value) => parseDurationMinutes(value, "research-duration")
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
          presetId: options.preset ? normalizeText(String(options.preset)).toLowerCase() : undefined,
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
            researchDurationMinutes:
              options.researchDuration !== undefined ? Number(options.researchDuration) : undefined,
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
      console.log(`Preset: ${String(options.preset).toLowerCase()}`);
      console.log(`Status: ${result.status}`);
      console.log(`Expected time: ${result.expectedMinutes} minutes`);
      console.log(`Actual runtime: ${result.elapsedMinutes} minutes`);
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
    .option("--preset <name>", "Workflow preset: fast, standard, or deep", "standard")
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
      "--research-duration <duration>",
      "Override the template research duration budget, for example 30m or 2h",
      (value) => parseDurationMinutes(value, "research-duration")
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
        presetId: options.preset ? normalizeText(String(options.preset)).toLowerCase() : undefined,
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
          researchDurationMinutes:
            options.researchDuration !== undefined ? Number(options.researchDuration) : undefined,
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
      console.log(`Preset: ${String(options.preset).toLowerCase()}`);
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
          `${queuedJob.queueId} ${queuedJob.status} attempts=${queuedJob.attempts}/${queuedJob.maxAttempts} job=${queuedJob.jobId ?? "-"} ${queuedJob.label}`
        );
      }
    });

  queue
    .command("pause <queueId>")
    .action((queueId) => {
      const queuedJob = getQueuedJob({
        queueId: String(queueId)
      });
      if (!queuedJob) {
        throw new Error(`Unknown queue item: ${queueId}`);
      }
      const updated = controlQueuedJob({
        queueId: String(queueId),
        action: "pause"
      });
      if (queuedJob.status === "running" && queuedJob.jobId) {
        requestAgentJobControl({
          jobId: queuedJob.jobId,
          action: "pause"
        });
      }
      console.log(`Queue item updated.`);
      console.log(`Queue ID: ${queuedJob.queueId}`);
      console.log(`Status: ${updated?.status ?? queuedJob.status}`);
      console.log(`Control: ${updated?.controlAction ?? "-"}`);
    });

  queue
    .command("resume <queueId>")
    .action((queueId) => {
      const updated = controlQueuedJob({
        queueId: String(queueId),
        action: "resume"
      });
      if (!updated) {
        throw new Error(`Unknown queue item: ${queueId}`);
      }
      console.log(`Queue item updated.`);
      console.log(`Queue ID: ${updated.queueId}`);
      console.log(`Status: ${updated.status}`);
    });

  queue
    .command("cancel <queueId>")
    .action((queueId) => {
      const queuedJob = getQueuedJob({
        queueId: String(queueId)
      });
      if (!queuedJob) {
        throw new Error(`Unknown queue item: ${queueId}`);
      }
      const updated = controlQueuedJob({
        queueId: String(queueId),
        action: "cancel"
      });
      if (queuedJob.status === "running" && queuedJob.jobId) {
        requestAgentJobControl({
          jobId: queuedJob.jobId,
          action: "cancel"
        });
      }
      console.log(`Queue item updated.`);
      console.log(`Queue ID: ${String(queueId)}`);
      console.log(`Status: ${updated?.status ?? queuedJob.status}`);
    });

  queue
    .command("retry <queueId>")
    .action((queueId) => {
      const updated = controlQueuedJob({
        queueId: String(queueId),
        action: "retry"
      });
      if (!updated) {
        throw new Error(`Unknown queue item: ${queueId}`);
      }
      console.log(`Queue item updated.`);
      console.log(`Queue ID: ${updated.queueId}`);
      console.log(`Status: ${updated.status}`);
    });

  const job = program
    .command("job")
    .description("Control and inspect stored jobs");

  job
    .command("pause <jobId>")
    .action((jobId) => {
      const updated = requestAgentJobControl({
        jobId: String(jobId),
        action: "pause"
      });
      if (!updated) {
        throw new Error(`Unknown job: ${jobId}`);
      }
      console.log(`Pause requested.`);
      console.log(`Job ID: ${updated.jobId}`);
      console.log(`Status: ${updated.status}`);
      console.log(`Control: ${updated.controlAction ?? "-"}`);
    });

  job
    .command("cancel <jobId>")
    .action((jobId) => {
      const updated = requestAgentJobControl({
        jobId: String(jobId),
        action: "cancel"
      });
      if (!updated) {
        throw new Error(`Unknown job: ${jobId}`);
      }
      console.log(`Cancel requested.`);
      console.log(`Job ID: ${updated.jobId}`);
      console.log(`Status: ${updated.status}`);
      console.log(`Control: ${updated.controlAction ?? "-"}`);
    });

  job
    .command("resume <jobId>")
    .action((jobId) => {
      const resumed = resumeAgentJob({
        jobId: String(jobId)
      });
      console.log(`Resume enqueued.`);
      console.log(`Job ID: ${String(jobId)}`);
      console.log(`Queue ID: ${resumed.queueId}`);
      console.log(`Reused paused queue: ${resumed.resumedExistingQueue ? "yes" : "no"}`);
      console.log(`Job DB: ${resumed.databasePath}`);
    });

  job
    .command("rerun <jobId>")
    .action((jobId) => {
      const rerun = rerunAgentJob({
        jobId: String(jobId)
      });
      console.log(`Rerun enqueued.`);
      console.log(`Source Job ID: ${String(jobId)}`);
      console.log(`Queue ID: ${rerun.queueId}`);
      console.log(`Job DB: ${rerun.databasePath}`);
    });

  job
    .command("logs <jobId>")
    .option(
      "--limit <number>",
      "Maximum number of log events to print",
      (value) => parsePositiveInteger(value, "limit"),
      50
    )
    .action((jobId, options) => {
      const events = listJobRunEvents({
        jobId: String(jobId),
        limit: Number(options.limit)
      });
      if (events.length === 0) {
        console.log("No job events found.");
        return;
      }
      for (const event of events) {
        console.log(`${event.createdAt} [${event.eventType}] ${event.message}`);
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
