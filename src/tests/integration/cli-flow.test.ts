import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { JobStore } from "../../lib/job-store";

function runCli(args: string[], env: NodeJS.ProcessEnv): string {
  const cliPath = path.join(process.cwd(), "dist", "cli.js");
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });
}

function createCompletedJob(databasePath: string, jobId: string): void {
  new JobStore({
    databasePath,
    jobId,
    taskType: "agent",
    workflowName: "article-research",
    title: "Integration job",
    instruction: "Check the CLI integration path",
    status: "completed",
    startedAt: "2026-04-22T12:00:00.000Z",
    updatedAt: "2026-04-22T12:02:00.000Z",
    completedAt: "2026-04-22T12:02:00.000Z",
    cachePath: null,
    reportPath: null,
    artifactDir: null,
    input: {
      instruction: "Check the CLI integration path",
      workflowName: "article-research",
      workflowTemplateId: "article-research",
      workflowPresetId: "standard",
      workflowInputs: {
        topic: "cli integration",
        audience: null,
        context: null
      },
      jobTitle: "Integration job"
    },
    budget: {},
    output: {}
  });
}

test("job report command prints a recovery recommendation for paused jobs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-cli-report-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    new JobStore({
      databasePath,
      jobId: "job_report",
      taskType: "agent",
      workflowName: "article-research",
      title: "Integration report job",
      instruction: "Check the CLI report path",
      status: "paused",
      startedAt: "2026-04-22T12:00:00.000Z",
      updatedAt: "2026-04-22T12:02:00.000Z",
      completedAt: null,
      cachePath: null,
      reportPath: null,
      artifactDir: null,
      input: {},
      budget: {},
      output: {}
    }).appendRunEvent("log", "Paused during CLI integration test");

    const output = runCli(["job", "report", "job_report"], {
      WEB_TASK_AGENT_DB_PATH: databasePath
    });

    assert.match(output, /Recovery Report: job_report/);
    assert.match(output, /Recoverable: yes/);
    assert.match(output, /web-task-agent job resume job_report/);
    assert.match(output, /Paused during CLI integration test/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("storage cleanup command prunes prompt trace manifests", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-cli-cleanup-"));
  const tracePath = path.join(tempDir, "runtime", "llm-prompt-traces.json");

  try {
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.writeFileSync(
      tracePath,
      JSON.stringify(
        {
          version: 1,
          updatedAt: "2026-04-22T12:00:00.000Z",
          traces: [
            { traceId: "trace_a" },
            { traceId: "trace_b" },
            { traceId: "trace_c" }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const output = runCli(["storage", "cleanup", "--prompt-traces", tracePath, "--max-traces", "2"], {
      WEB_TASK_AGENT_DB_PATH: path.join(tempDir, "jobs.sqlite")
    });

    const manifest = JSON.parse(fs.readFileSync(tracePath, "utf8")) as {
      traces: Array<{ traceId: string }>;
    };

    assert.match(output, /Prompt trace cleanup:/);
    assert.match(output, /Removed: 1/);
    assert.deepEqual(
      manifest.traces.map((trace) => trace.traceId),
      ["trace_b", "trace_c"]
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("storage gate command passes when the local database is healthy", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-cli-gate-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    createCompletedJob(databasePath, "job_gate");

    const output = runCli(["storage", "gate"], {
      WEB_TASK_AGENT_DB_PATH: databasePath
    });

    assert.match(output, /Production Hardening Gate: PASS/);
    assert.match(output, /Storage health: ok/);
    assert.match(output, /No recoverable jobs remain\./);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
