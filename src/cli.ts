#!/usr/bin/env node
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { requestAgentJobControl, resumeAgentJob, rerunAgentJob } from "./lib/job-operations";
import {
  controlQueuedJob,
  enqueueQueuedAgentJob,
  getQueuedJob,
  getQueuedJobSummary,
  listQueuedJobs
} from "./lib/job-queue";
import {
  getStoredJobDetail,
  listRecoverableJobs,
  listJobRunEvents,
  listStoredJobs,
  maintainJobStore,
  backupJobStore,
  restoreJobStore
} from "./lib/job-store";
import { normalizeCliArgv } from "./lib/cli-argv";
import { formatCliErrorMessage } from "./lib/cli-error";
import { ensureLlmRuntimeEnvironment } from "./lib/runtime-env";
import { inspectCdpBackend } from "./lib/cdp";
import {
  formatQueuedJobDebugLines,
  formatStoredJobDebugLines
} from "./lib/debug-format";
import { formatStoredJobRecoveryReportLines } from "./lib/recovery-report";
import { formatStoredJobPerformanceBudgetLines } from "./lib/performance-budget";
import { evaluateProductionHardeningGate, formatProductionHardeningGateLines } from "./lib/hardening-gate";
import { formatStoredJobRuntimeSummary } from "./lib/runtime-summary";
import { maintainPromptTraceRetention } from "./lib/prompt-trace";
import { logStructured } from "./lib/local-logging";
import { assessStorageHealth } from "./lib/storage-validation";
import {
  compareDecisionReceipts,
  renderDecisionReceiptComparison,
  verifyReceiptDirectory
} from "./lib/receipt";
import {
  buildJobExportData,
  compareJobExports,
  renderJobComparison,
  renderJobExport,
  type JobExportFormat
} from "./lib/job-export";
import {
  createManagementServer,
  formatManagementServerUrl,
  requireLoopbackManagementHost
} from "./server/management-server";
import { AgentRunnerTask } from "./tasks/agent-runner";
import { GitHubScannerTask } from "./tasks/github-scanner";
import { PlayStoreAnalyzerTask } from "./tasks/playstore-analyzer";
import { QueueWorkerTask } from "./tasks/queue-worker";
import { listDemoFixtures, writeDemoPackage } from "./demos";
import { DECISION_PACKS, getDecisionPack, renderDecisionPackPlan } from "./packs";
import {
  buildWorkflowRunOptions,
  getWorkflowTemplate,
  getWorkflowPreset,
  listWorkflowTemplates
} from "./workflows";
import { writeWorkflowProposalScaffold } from "./workflows/scaffold";
import {
  formatWorkflowProposalValidation,
  validateWorkflowProposalFile
} from "./workflows/proposal-validation";

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

function parseJobExportFormat(value: string, allowed: readonly JobExportFormat[]): JobExportFormat {
  const normalized = value.trim().toLowerCase() as JobExportFormat;
  if (!allowed.includes(normalized)) {
    throw new Error(`format must be one of: ${allowed.join(", ")}`);
  }
  return normalized;
}

function exportExtension(format: JobExportFormat): string {
  return format === "markdown" ? "md" : format;
}

function writeLocalExport(input: {
  outputPath: string;
  content: string;
  force: boolean;
  dryRun: boolean;
  summary: string[];
}): void {
  if (input.dryRun) {
    console.log("Export preview (no file written, no network request):");
    for (const line of input.summary) {
      console.log(`  ${line}`);
    }
    console.log(`  Destination: ${input.outputPath}`);
    return;
  }
  if (fs.existsSync(input.outputPath) && !input.force) {
    throw new Error(`refusing to overwrite ${input.outputPath}; pass --force to replace it.`);
  }
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, input.content, "utf8");
  console.log(`Local export written: ${input.outputPath}`);
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("web-task-agent")
    .description(
      "Local-first long-running web research using Lightpanda, CDP, SQLite, queue workers, and evidence-backed workflow packages"
    )
    .showHelpAfterError();

  program.addHelpText(
    "beforeAll",
    `
Common commands:
  web-task-agent demo list
  web-task-agent demo export browser-agent-landscape
  web-task-agent workflow list
  web-task-agent workflow run <template> --topic <text>
  web-task-agent agent run <instruction>
  web-task-agent queue list
  web-task-agent job logs <job-id> --limit 100

Use "web-task-agent <command> --help" for the full option list.
`
  );

  const demo = program
    .command("demo")
    .description("Inspect deterministic, source-linked package demos without an API key or browser session");

  demo
    .command("list")
    .description("List bundled deterministic demo packages")
    .action(() => {
      const fixtures = listDemoFixtures();
      console.log(`Available demos: ${fixtures.length}`);
      for (const fixture of fixtures) {
        console.log(`- ${fixture.id}: ${fixture.title}`);
        console.log(`  ${fixture.description}`);
      }
    });

  demo
    .command("export <id>")
    .description("Write a deterministic demo package without calling an LLM or browser")
    .option("--output <path>", "Destination directory for the package")
    .option("--force", "Replace files in an existing destination")
    .action((id, options) => {
      const destination = options.output
        ? path.resolve(String(options.output))
        : path.join(process.cwd(), "reports", "demos", String(id));
      const written = writeDemoPackage({
        id: String(id),
        outputDir: destination,
        force: Boolean(options.force)
      });
      console.log("Demo package exported.");
      console.log(`Package: ${written.outputDir}`);
      console.log(`Brief: ${written.workflowBriefPath}`);
      console.log(`Receipt: ${written.receiptPath}`);
      console.log(`Report: ${written.reportPath}`);
      console.log(`Sources: ${written.sourcesPath}`);
    });

  const receipt = program
    .command("receipt")
    .description("Inspect and verify a portable decision receipt");

  receipt
    .command("verify <directory>")
    .description("Verify receipt structure, evidence references, and exported file hashes offline")
    .action((directory) => {
      const result = verifyReceiptDirectory(String(directory));
      console.log(`Receipt: ${path.resolve(String(directory))}`);
      console.log(`Checked files: ${result.checkedFiles}`);
      console.log(`Status: ${result.valid ? "valid" : "invalid"}`);
      if (!result.valid) {
        for (const error of result.errors) {
          console.error(`- ${error}`);
        }
        process.exitCode = 1;
      } else {
        console.log("Evidence references, source snapshots, and integrity hashes are consistent.");
        console.log("Note: hashes do not prove that a source is true, complete, authorized, or fresh.");
      }
    });

  receipt
    .command("compare <earlierDirectory> <laterDirectory>")
    .description("Compare two verified decision receipts and explain why the decision changed")
    .option("--format <format>", "Comparison format: markdown or json", "markdown")
    .option("--output <path>", "Destination file path")
    .option("--dry-run", "Preview the comparison without writing")
    .option("--force", "Replace an existing output file")
    .action((earlierDirectory, laterDirectory, options) => {
      const earlierVerification = verifyReceiptDirectory(String(earlierDirectory));
      const laterVerification = verifyReceiptDirectory(String(laterDirectory));
      if (!earlierVerification.valid) {
        throw new Error(`earlier receipt is invalid: ${earlierVerification.errors.join("; ")}`);
      }
      if (!laterVerification.valid) {
        throw new Error(`later receipt is invalid: ${laterVerification.errors.join("; ")}`);
      }
      const format = parseJobExportFormat(String(options.format), ["markdown", "json"]) as "markdown" | "json";
      const comparison = compareDecisionReceipts(
        earlierVerification.receipt!,
        laterVerification.receipt!
      );
      const outputPath = options.output
        ? path.resolve(String(options.output))
        : path.resolve("reports", "receipts", "decision-diff", `receipt-diff.${exportExtension(format)}`);
      writeLocalExport({
        outputPath,
        content: renderDecisionReceiptComparison(comparison, format),
        force: Boolean(options.force),
        dryRun: Boolean(options.dryRun),
        summary: [
          `Earlier: ${comparison.earlierTitle}`,
          `Later: ${comparison.laterTitle}`,
          `New sources: ${comparison.newSources.length}`,
          `Sources no longer present: ${comparison.disappearedSources.length}`,
          `Decision changed: ${comparison.decisionChanged ? "yes" : "no"}`
        ]
      });
    });

  const browser = program
    .command("browser")
    .description("Inspect the configured local Chrome DevTools Protocol endpoint without opening a page");

  browser
    .command("status")
    .description("Show the configured CDP backend and its safe operating boundary")
    .action(async () => {
      const status = await inspectCdpBackend();
      console.log(`CDP endpoint: ${status.endpoint}`);
      console.log(`Reachable: ${status.reachable ? "yes" : "no"}`);
      console.log(`Backend: ${status.backend}`);
      if (status.browser) console.log(`Browser: ${status.browser}`);
      if (status.protocolVersion) console.log(`Protocol: ${status.protocolVersion}`);
      console.log(`Status: ${status.message}`);
      console.log("Permission: status does not launch, restart, attach to, or navigate a browser.");
      if (status.backend === "lightpanda" || status.backend === "unavailable") {
        console.log("Guidance: Lightpanda is the default managed backend; use npm run lightpanda:start to start it deliberately.");
      } else if (status.backend === "chrome") {
        console.log("Guidance: Chrome/Chromium is an operator-managed CDP backend. Keep its debugging port local and manage its lifecycle yourself.");
      } else {
        console.log("Guidance: this endpoint is reachable but unrecognized; use a browser that supports the CDP operations needed by the workflow.");
      }
    });

  program
    .command("github")
    .description("Research GitHub repositories with the general-purpose browser scanner")
    .requiredOption("--url <url>", "GitHub search URL to scan")
    .option("--pages <number>", "Maximum number of pages to scrape", (value) => parsePositiveInteger(value, "pages"), 10)
    .requiredOption("--criteria <text>", "Claude evaluation criteria")
    .option("--resume", "Resume the latest cached GitHub run")
    .option("--cache <path>", "Use a specific cache file")
    .option("--report <path>", "Write the Markdown report to a specific path")
    .action(async (options) => {
      ensureLlmRuntimeEnvironment("github");
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
    .description("Research Play Store results with the general-purpose browser scanner")
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
      ensureLlmRuntimeEnvironment("playstore");
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
    .description("Run a long-form agent job immediately")
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
      ensureLlmRuntimeEnvironment("agent run");
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
    .description("Queue a long-form agent job for a worker")
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
      ensureLlmRuntimeEnvironment("agent enqueue");
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
    .command("preview <template>")
    .description("Show a workflow's budget, output path, and source-policy boundary without running it")
    .requiredOption("--topic <text>", "Topic, niche, or seed question to research")
    .option("--preset <name>", "Workflow preset: fast, focused, standard, or deep", "standard")
    .action((templateId, options) => {
      const template = getWorkflowTemplate(String(templateId));
      if (!template) throw new Error(`Unknown workflow template: ${templateId}`);
      const resolved = buildWorkflowRunOptions({ templateId: template.id, topic: normalizeText(String(options.topic)), presetId: normalizeText(String(options.preset)).toLowerCase() });
      console.log(`Workflow preview: ${template.title}`);
      console.log(`Decision focus: ${template.decisionFocus ?? template.description}`);
      console.log(`Prefer sources: ${(template.preferredSources ?? ["official documentation", "public product pages", "public community discussions"]).join("; ")}`);
      console.log(`Preset: ${resolved.workflowPresetId}`);
      console.log(`Budget: ${resolved.maxQueries} queries, ${resolved.maxResultsPerQuery} results/query, ${resolved.fetchBatchSize} fetches/batch, ${resolved.maxRuntimeHours}h soft maximum`);
      console.log(`Output: ${resolved.reportPath}`);
      console.log("Safety: public HTTP(S) URLs only; private/local targets, credentials in URLs, configured blocked domains, and detected prompt-injection pages are quarantined.");
      console.log("Permission: no browser, source fetch, LLM request, or file write occurs during preview.");
    });

  workflow
    .command("scaffold <id>")
    .description("Create a reviewable workflow proposal with definition, example, and test plan")
    .requiredOption("--title <text>", "Operator-facing workflow title")
    .requiredOption("--category <text>", "Decision category")
    .option("--output <path>", "Proposal root directory", "workflows/proposals")
    .option("--force", "Replace an existing proposal scaffold")
    .action((id, options) => {
      const written = writeWorkflowProposalScaffold({
        id: String(id),
        title: normalizeText(String(options.title)),
        category: normalizeText(String(options.category)),
        outputDir: String(options.output),
        force: Boolean(options.force)
      });
      console.log("Workflow proposal scaffold created.");
      console.log(`Definition: ${written.definitionPath}`);
      console.log(`Example: ${written.examplePath}`);
      console.log(`Fixture: ${written.fixturePath}`);
      console.log(`Test plan: ${written.testPlanPath}`);
      console.log("Next: replace scaffold placeholders, run workflow validate on the definition, then request reviewer evidence and fixture coverage.");
    });

  workflow
    .command("validate <definition>")
    .description("Validate a workflow proposal schema without registering or running it")
    .action((definition) => {
      const result = validateWorkflowProposalFile(String(definition));
      for (const line of formatWorkflowProposalValidation(result)) {
        console.log(line);
      }
      console.log("Permission: validation does not register a workflow, launch a browser, call an LLM, or write a file.");
      if (!result.valid) {
        throw new Error("workflow proposal validation failed; fix every listed error before requesting review");
      }
    });

  const pack = program
    .command("pack")
    .description("Create review-gated, multi-step decision plans without automatically launching work");

  pack
    .command("list")
    .description("List decision packs")
    .action(() => {
      console.log(`Available packs: ${DECISION_PACKS.length}`);
      for (const definition of DECISION_PACKS) {
        console.log(`- ${definition.id}: ${definition.title}`);
        console.log(`  ${definition.description}`);
      }
    });

  pack
    .command("plan <id>")
    .description("Write a review-gated pack plan; it never launches browser or LLM work")
    .requiredOption("--topic <text>", "Topic, niche, or seed question to research")
    .option("--audience <text>", "Optional audience to optimize the plan for")
    .option("--context <text>", "Optional business context or constraint")
    .option("--preset <name>", "Preset for generated workflow commands", "standard")
    .option("--output <path>", "Write the plan to a specific Markdown file")
    .option("--dry-run", "Print the review-gated plan and bounds without writing a file")
    .action((id, options) => {
      const definition = getDecisionPack(String(id));
      if (!definition) throw new Error(`Unknown decision pack: ${id}`);
      const topic = normalizeText(String(options.topic));
      const content = renderDecisionPackPlan({ pack: definition, topic, preset: normalizeText(String(options.preset)).toLowerCase(), audience: options.audience ? normalizeText(String(options.audience)) : null, context: options.context ? normalizeText(String(options.context)) : null });
      if (options.dryRun) {
        console.log("Review-gated decision pack preview (nothing written or launched).");
        console.log(content);
        return;
      }
      const outputPath = options.output ? path.resolve(String(options.output)) : path.join(process.cwd(), "reports", "packs", definition.id, topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topic", "plan.md");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${content}\n`, "utf8");
      console.log("Review-gated decision pack plan created.");
      console.log(`Plan: ${outputPath}`);
      console.log("Next: preview or run only the first listed workflow, then review its evidence package before continuing.");
    });

  workflow
    .command("list")
    .description("List workflow templates, with optional catalog filters")
    .option("--category <text>", "Only show workflows whose category matches this text")
    .option("--search <text>", "Only show workflows matching an id, title, tag, or description")
    .action((options) => {
      const categoryFilter = options.category ? normalizeText(String(options.category)).toLowerCase() : "";
      const searchFilter = options.search ? normalizeText(String(options.search)).toLowerCase() : "";
      const templates = listWorkflowTemplates().filter((template) => {
        const categoryMatches = !categoryFilter || (template.category ?? "").toLowerCase().includes(categoryFilter);
        const searchable = [
          template.id,
          template.title,
          template.description,
          template.category ?? "",
          ...(template.tags ?? [])
        ].join(" ").toLowerCase();
        return categoryMatches && (!searchFilter || searchable.includes(searchFilter));
      });
      console.log(`Available workflows: ${templates.length}`);
      if (templates.length === 0) {
        console.log("No workflows match the supplied filters.");
        return;
      }
      for (const template of templates) {
        console.log(`- ${template.id}: ${template.title}`);
        console.log(`  ${template.description}`);
        if (template.category) {
          console.log(`  Category: ${template.category}`);
        }
        console.log(`  Default preset: ${template.defaultPresetId}`);
        console.log(`  Example: ${template.examplePath}`);
      }
    });

  workflow
    .command("run <template>")
    .description("Run a workflow template immediately")
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
      const preset = getWorkflowPreset(
        template,
        options.preset ? normalizeText(String(options.preset)).toLowerCase() : undefined
      );
      ensureLlmRuntimeEnvironment(`workflow run ${template.id}`);

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
      console.log(`Preset: ${preset.id} (${preset.description})`);
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
    .description("Queue a workflow template for a worker")
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
      const preset = getWorkflowPreset(
        template,
        options.preset ? normalizeText(String(options.preset)).toLowerCase() : undefined
      );
      ensureLlmRuntimeEnvironment(`workflow enqueue ${template.id}`);

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
      console.log(`Preset: ${preset.id} (${preset.description})`);
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
    .description("List queued jobs and their current state")
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
        console.log(`Queue item: ${queuedJob.queueId}`);
        console.log(`  Status: ${queuedJob.status}`);
        console.log(`  Attempts: ${queuedJob.attempts}/${queuedJob.maxAttempts}`);
        console.log(`  Job ID: ${queuedJob.jobId ?? "-"}`);
        console.log(`  Label: ${queuedJob.label}`);
      }
    });

  queue
    .command("pause <queueId>")
    .description("Pause a queued job")
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
      console.log(`Label: ${queuedJob.label}`);
    });

  queue
    .command("resume <queueId>")
    .description("Resume a paused queued job")
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
    .description("Cancel a queued job")
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
      console.log(`Label: ${queuedJob.label}`);
    });

  queue
    .command("retry <queueId>")
    .description("Retry a failed queued job")
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
    .description("Request a pause for a stored job")
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
    .description("Request a cancel for a stored job")
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
    .description("Resume a paused stored job")
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
    .description("Queue a rerun of a stored job")
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
    .description("Print recent stored job log events")
    .option(
      "--limit <number>",
      "Maximum number of log events to print",
      (value) => parsePositiveInteger(value, "limit"),
      50
    )
    .option("--output <path>", "Write the job log events to a file")
    .action((jobId, options) => {
      const events = listJobRunEvents({
        jobId: String(jobId),
        limit: Number(options.limit)
      });
      if (events.length === 0) {
        console.log("No job events found.");
        return;
      }

      const renderedLines = [
        `Job logs: ${String(jobId)}`,
        `Events returned: ${events.length}`,
        ...events.flatMap((event) => [
          `- ${event.createdAt}`,
          `  Type: ${event.eventType}`,
          `  Message: ${event.message}`
        ])
      ];

      if (options.output) {
        const outputPath = path.resolve(String(options.output));
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, `${renderedLines.join("\n")}\n`, "utf8");
        console.log(`Wrote job logs to ${outputPath}`);
      } else {
        for (const line of renderedLines) {
          console.log(line);
        }
      }
    });

  job
    .command("export <jobId>")
    .description("Export a local job as shareable Markdown, JSON, or source CSV; no data leaves this machine")
    .option("--format <format>", "Export format: markdown, json, or csv", "markdown")
    .option("--output <path>", "Destination file path")
    .option("--redact", "Redact recognized secrets before previewing or writing")
    .option("--dry-run", "Preview exactly what would be exported without writing")
    .option("--force", "Replace an existing export file")
    .action((jobId, options) => {
      const detail = getStoredJobDetail({ jobId: String(jobId) });
      if (!detail) {
        throw new Error(`Unknown job: ${jobId}`);
      }
      const format = parseJobExportFormat(String(options.format), ["markdown", "json", "csv"]);
      const data = buildJobExportData(detail);
      const outputPath = options.output
        ? path.resolve(String(options.output))
        : path.resolve("reports", "exports", `${detail.job.jobId}.${exportExtension(format)}`);
      writeLocalExport({
        outputPath,
        content: renderJobExport(data, format, Boolean(options.redact)),
        force: Boolean(options.force),
        dryRun: Boolean(options.dryRun),
        summary: [
          `Job: ${data.job.id} (${data.job.status})`,
          `Format: ${format}`,
          `Sources: ${data.sources.length}`,
          `Redaction: ${options.redact ? "enabled" : "disabled"}`
        ]
      });
    });

  job
    .command("compare <leftJobId> <rightJobId>")
    .description("Compare two local jobs for source and conclusion changes without sending data anywhere")
    .option("--format <format>", "Comparison format: markdown or json", "markdown")
    .option("--output <path>", "Destination file path")
    .option("--redact", "Redact recognized secrets before previewing or writing")
    .option("--dry-run", "Preview the comparison export without writing")
    .option("--force", "Replace an existing comparison file")
    .action((leftJobId, rightJobId, options) => {
      const left = getStoredJobDetail({ jobId: String(leftJobId) });
      const right = getStoredJobDetail({ jobId: String(rightJobId) });
      if (!left) throw new Error(`Unknown job: ${leftJobId}`);
      if (!right) throw new Error(`Unknown job: ${rightJobId}`);
      const format = parseJobExportFormat(String(options.format), ["markdown", "json"]) as "markdown" | "json";
      const comparison = compareJobExports(buildJobExportData(left), buildJobExportData(right));
      const outputPath = options.output
        ? path.resolve(String(options.output))
        : path.resolve("reports", "exports", `${left.job.jobId}-vs-${right.job.jobId}.${exportExtension(format)}`);
      writeLocalExport({
        outputPath,
        content: renderJobComparison(comparison, format, Boolean(options.redact)),
        force: Boolean(options.force),
        dryRun: Boolean(options.dryRun),
        summary: [
          `Earlier job: ${comparison.leftJobId}`,
          `Later job: ${comparison.rightJobId}`,
          `New sources: ${comparison.newSources.length}`,
          `Sources no longer present: ${comparison.disappearedSources.length}`,
          `Decision changed: ${comparison.decisionChanged ? "yes" : "no"}`,
          `Redaction: ${options.redact ? "enabled" : "disabled"}`
        ]
      });
    });

  job
    .command("report <jobId>")
    .description("Print a recovery-focused report for a stored job")
    .action((jobId) => {
      const detail = getStoredJobDetail({
        jobId: String(jobId)
      });
      if (!detail) {
        throw new Error(`Unknown job: ${jobId}`);
      }

      const recoverableJobIds = new Set(
        listRecoverableJobs({
          limit: 200
        }).map((record) => record.jobId)
      );

      for (const line of formatStoredJobRecoveryReportLines(detail, recoverableJobIds)) {
        console.log(line);
      }
    });

  job
    .command("budget <jobId>")
    .description("Print a soft latency budget report for a stored job")
    .action((jobId) => {
      const detail = getStoredJobDetail({
        jobId: String(jobId)
      });
      if (!detail) {
        throw new Error(`Unknown job: ${jobId}`);
      }

      for (const line of formatStoredJobPerformanceBudgetLines(detail)) {
        console.log(line);
      }
    });

  queue
    .command("stats")
    .description("Show queue counts by status")
    .action(() => {
      const summary = getQueuedJobSummary();
      console.log(`Queue summary:`);
      console.log(`  Queued: ${summary.queued}`);
      console.log(`  Running: ${summary.running}`);
      console.log(`  Paused: ${summary.paused}`);
      console.log(`  Completed: ${summary.completed}`);
      console.log(`  Failed: ${summary.failed}`);
      console.log(`  Cancelled: ${summary.cancelled}`);
    });

  job
    .command("inspect <jobId>")
    .description("Show a stored job summary, steps, and artifact paths")
    .action((jobId) => {
      const detail = getStoredJobDetail({
        jobId: String(jobId)
      });
      if (!detail) {
        throw new Error(`Unknown job: ${jobId}`);
      }

      console.log(`Job ID: ${detail.job.jobId}`);
      console.log(`Title: ${detail.job.title}`);
      console.log(`Status: ${detail.job.status}`);
      console.log(`Task Type: ${detail.job.taskType}`);
      console.log(`Runtime Summary: ${formatStoredJobRuntimeSummary(detail)}`);
      console.log(`Report: ${detail.job.reportPath ?? "-"}`);
      console.log(`Artifact Dir: ${detail.job.artifactDir ?? "-"}`);
      console.log(`Steps: ${detail.steps.length}`);
      console.log(`Artifacts: ${detail.artifacts.length}`);
      console.log(
        `Evidence Graph: ${detail.evidenceGraph.nodes} nodes, ${detail.evidenceGraph.edges} edges, ` +
          `${detail.evidenceGraph.danglingEdges} dangling, ${detail.evidenceGraph.orphanNodes} orphaned`
      );

      if (detail.artifacts.length > 0) {
        console.log("Artifact paths:");
        for (const artifact of detail.artifacts) {
          console.log(`- ${artifact.artifactKey}: ${artifact.path}`);
        }
      }
    });

  const debug = program
    .command("debug")
    .description("Quick debugging shortcuts for local operators");

  debug
    .command("summary")
    .description("Show a compact runtime summary of stored jobs and the queue")
    .action(() => {
      const jobs = listStoredJobs({
        limit: 200
      });
      const queueSummary = getQueuedJobSummary();
      const recoverable = listRecoverableJobs();

      console.log(`Debug summary:`);
      console.log(`  Stored jobs: ${jobs.length}`);
      console.log(`  Queue queued: ${queueSummary.queued}`);
      console.log(`  Queue running: ${queueSummary.running}`);
      console.log(`  Queue paused: ${queueSummary.paused}`);
      console.log(`  Recoverable jobs: ${recoverable.length}`);
    });

  debug
    .command("job <jobId>")
    .description("Print a compact job debug view")
    .action((jobId) => {
      const detail = getStoredJobDetail({
        jobId: String(jobId)
      });
      if (!detail) {
        throw new Error(`Unknown job: ${jobId}`);
      }

      for (const line of formatStoredJobDebugLines(detail)) {
        console.log(line);
      }
    });

  debug
    .command("queue <queueId>")
    .description("Print a compact queue debug view")
    .action((queueId) => {
      const queuedJob = getQueuedJob({
        queueId: String(queueId)
      });
      if (!queuedJob) {
        throw new Error(`Unknown queue item: ${queueId}`);
      }

      for (const line of formatQueuedJobDebugLines(queuedJob)) {
        console.log(line);
      }
    });

  const storage = program
    .command("storage")
    .description("Inspect and maintain the local job database");

  storage
    .command("maintain")
    .description("Show local storage stats and optionally vacuum the database")
    .option("--vacuum", "Run VACUUM after collecting the storage summary")
    .action((options) => {
      const summary = maintainJobStore({
        vacuum: Boolean(options.vacuum)
      });
      console.log(`Storage summary:`);
      console.log(`  Database: ${summary.databasePath}`);
      console.log(`  Schema version: ${summary.schemaVersion}`);
      console.log(`  Jobs: ${summary.jobs}`);
      console.log(`  Steps: ${summary.steps}`);
      console.log(`  Artifacts: ${summary.artifacts}`);
      console.log(`  Events: ${summary.events}`);
      console.log(`  Pages: ${summary.pages}`);
      console.log(`  Freelist pages: ${summary.freelistPages}`);
      console.log(`  Vacuumed: ${summary.vacuumed ? "yes" : "no"}`);
      const health = assessStorageHealth(summary);
      console.log(`  Health: ${health.healthy ? "healthy" : "attention needed"}`);
      for (const warning of health.warnings) {
        console.log(`  Warning: ${warning}`);
      }
    });

  storage
    .command("cleanup")
    .description("Prune prompt-trace manifests without touching evidence artifacts")
    .requiredOption("--prompt-traces <path>", "Prompt trace manifest to clean up")
    .option(
      "--max-traces <number>",
      "Maximum prompt traces to keep in the manifest",
      (value) => parsePositiveInteger(value, "max-traces"),
      2000
    )
    .option("--dry-run", "Preview the cleanup without writing changes")
    .action((options) => {
      const summary = maintainPromptTraceRetention({
        tracePath: String(options.promptTraces),
        maxTraces: Number(options.maxTraces),
        dryRun: Boolean(options.dryRun)
      });

      console.log("Prompt trace cleanup:");
      console.log(`  Trace path: ${summary.tracePath}`);
      console.log(`  Max traces: ${summary.maxTraces}`);
      console.log(`  Before: ${summary.beforeCount}`);
      console.log(`  After: ${summary.afterCount}`);
      console.log(`  Removed: ${summary.removedCount}`);
      console.log(`  Dry run: ${summary.dryRun ? "yes" : "no"}`);
    });

  storage
    .command("backup")
    .description("Create a consistent local SQLite backup without uploading any data")
    .requiredOption("--output <path>", "Destination SQLite backup path")
    .action((options) => {
      const backup = backupJobStore({ outputPath: String(options.output) });
      console.log("Local storage backup created.");
      console.log(`  Database: ${backup.databasePath}`);
      console.log(`  Backup: ${backup.backupPath}`);
      console.log(`  Size: ${backup.sizeBytes} bytes`);
    });

  storage
    .command("restore")
    .description("Restore a local SQLite backup and create a safety backup of current state")
    .requiredOption("--input <path>", "Existing SQLite backup to restore")
    .option("--backup <path>", "Safety backup destination for the current database")
    .option("--force", "Confirm replacement of the current local database")
    .action((options) => {
      const restored = restoreJobStore({
        inputPath: String(options.input),
        backupPath: options.backup ? String(options.backup) : undefined,
        force: Boolean(options.force)
      });
      console.log("Local storage restore completed.");
      console.log(`  Database: ${restored.databasePath}`);
      console.log(`  Restored from: ${restored.restoredFrom}`);
      console.log(`  Safety backup: ${restored.safetyBackupPath ?? "not needed (no prior database)"}`);
    });

  storage
    .command("gate")
    .description("Run the final production-hardening readiness gate")
    .action(() => {
      const storageSummary = maintainJobStore({
        vacuum: false
      });
      const storageHealth = assessStorageHealth(storageSummary);
      const queueSummary = getQueuedJobSummary();
      const recoverableJobs = listRecoverableJobs({
        limit: 200
      }).length;
      const gate = evaluateProductionHardeningGate({
        storage: storageHealth,
        queue: queueSummary,
        recoverableJobs
      });

      for (const line of formatProductionHardeningGateLines(gate)) {
        console.log(line);
      }
    });

  program
    .command("worker")
    .description("Run a local worker that processes queued jobs")
    .command("run")
    .description("Run the worker loop until the queue is empty or the process is interrupted")
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
      ensureLlmRuntimeEnvironment("worker run");
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
    .description("Start the local API and HTML dashboard")
    .option(
      "--host <host>",
      "Loopback host to bind (127.0.0.1 or ::1; network hosts are refused)",
      (value) => requireLoopbackManagementHost(String(value)),
      "127.0.0.1"
    )
    .option(
      "--port <number>",
      "Port to bind",
      (value) => parsePositiveInteger(value, "port"),
      4317
    )
    .action(async (options) => {
      const server = createManagementServer();
      const host = requireLoopbackManagementHost(String(options.host));
      const port = Number(options.port);
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      });

      console.log(`Management server running.`);
      console.log(`URL: ${formatManagementServerUrl(host, port)}`);

      await new Promise<void>(() => {
        // Keep the process alive until it is interrupted.
      });
    });

  await program.parseAsync(normalizeCliArgv(process.argv));
}

main().catch((error: unknown) => {
  logStructured("cli", error instanceof Error ? error.message : String(error), "error", {
    stack: error instanceof Error ? error.stack ?? null : null
  });
  console.error(formatCliErrorMessage(error));
  process.exitCode = 1;
});
