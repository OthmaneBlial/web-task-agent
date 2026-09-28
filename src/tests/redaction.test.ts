import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  closeSharedJobDatabase,
  getStoredJobDetail,
  JobStore,
  listJobRunEvents
} from "../lib/job-store";
import { appendStructuredLog } from "../lib/local-logging";
import { redactSensitiveText, redactSensitiveValue } from "../lib/redaction";
import { BaseTask } from "../tasks/BaseTask";

class LoggingTestTask extends BaseTask<Record<string, never>, void> {
  async run(): Promise<void> {}

  emit(message: string): void {
    this.log(message);
  }
}

test("redaction removes common API and GitHub tokens from text and nested log details", () => {
  const npmToken = "npm_0123456789abcdef0123456789abcdef";
  const raw = `ANTHROPIC_API_KEY=sk-ant-example_token_123456 ghp_123456789012345678901234567890 ${npmToken}`;
  const redacted = redactSensitiveText(raw);

  assert.match(redacted, /ANTHROPIC_API_KEY=\[REDACTED\]/);
  assert.doesNotMatch(redacted, /sk-ant-example/);
  assert.doesNotMatch(redacted, /ghp_123/);
  assert.doesNotMatch(redacted, /npm_012/);
  assert.deepEqual(redactSensitiveValue({ token: "Bearer abcdefghijklmnop", nested: [raw] }), {
    token: "[REDACTED]",
    nested: [redacted]
  });

  const assignments = redactSensitiveText(
    "password=plain-password access_token='refresh secret' REQUEST_TOKEN_COUNT=3"
  );
  assert.match(assignments, /password=\[REDACTED\]/);
  assert.match(assignments, /access_token='\[REDACTED\]'/);
  assert.match(assignments, /REQUEST_TOKEN_COUNT=3/);
  assert.doesNotMatch(assignments, /plain-password|refresh secret/);
  assert.doesNotMatch(
    redactSensitiveText("Authorization: Basic YWxpY2U6c2VjcmV0"),
    /YWxpY2U6c2VjcmV0/
  );
  assert.match(redactSensitiveText("AWS_SECRET_ACCESS_KEY=example-aws-secret"), /\[REDACTED\]/);

  const previousSecret = process.env.WEB_TASK_AGENT_API_KEY;
  process.env.WEB_TASK_AGENT_API_KEY = "example-local-env-secret-value";
  try {
    const privateText = redactSensitiveText(
      "contact alice@example.test; token " + process.env.WEB_TASK_AGENT_API_KEY + "; file " +
      path.join(os.homedir(), "client", "report.md")
    );
    assert.match(privateText, /\[REDACTED_EMAIL\]/);
    assert.match(privateText, /\[REDACTED\]/);
    assert.match(privateText, /\[LOCAL_PATH\]/);
    assert.doesNotMatch(privateText, /alice@example\.test|example-local-env-secret-value/);
    assert.equal(privateText.includes(os.homedir()), false);
  } finally {
    if (previousSecret === undefined) delete process.env.WEB_TASK_AGENT_API_KEY;
    else process.env.WEB_TASK_AGENT_API_KEY = previousSecret;
  }

  assert.deepEqual(
    redactSensitiveValue({
      apiKey: "example-provider-key",
      nested: {
        refreshToken: "plain-refresh-token",
        password: "plain-password",
        tokenCount: 3,
        reportPath: path.join(os.homedir(), "client", "report.md"),
        evidencePath: "evidence/source.md",
        email: "alice@example.test"
      }
    }),
    {
      apiKey: "[REDACTED]",
      nested: {
        refreshToken: "[REDACTED]",
        password: "[REDACTED]",
        tokenCount: 3,
        reportPath: "[LOCAL_PATH]",
        evidencePath: "evidence/source.md",
        email: "[REDACTED_EMAIL]"
      }
    }
  );
});

test("structured logs persist redacted messages and details", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-redaction-"));
  const logPath = path.join(tempDir, "agent.jsonl");

  try {
    appendStructuredLog({
      timestamp: "2026-08-26T00:00:00.000Z",
      level: "error",
      scope: "test",
      message: "Bearer abcdefghijklmnop",
      details: { apiKey: "example-provider-key", nested: { refreshToken: "plain-refresh-token" } }
    }, logPath);
    const persisted = fs.readFileSync(logPath, "utf8");
    assert.doesNotMatch(persisted, /abcdefghijklmnop|example-provider-key|plain-refresh-token/);
    assert.match(persisted, /\[REDACTED\]/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("task console logs are redacted before display and persistence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-task-log-redaction-"));
  const originalCwd = process.cwd();
  const originalLog = console.log;
  let output = "";

  try {
    process.chdir(tempDir);
    console.log = (...values: Parameters<typeof console.log>) => {
      output = values.map(String).join(" ");
    };
    new LoggingTestTask({}).emit("ghp_123456789012345678901234567890");

    const persisted = fs.readFileSync(
      path.join(tempDir, ".data", "logs", "web-task-agent.jsonl"),
      "utf8"
    );
    assert.doesNotMatch(output, /ghp_123/);
    assert.doesNotMatch(persisted, /ghp_123/);
    assert.match(output, /\[REDACTED\]/);
  } finally {
    console.log = originalLog;
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("job events and stored errors redact secret-shaped fields", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-job-log-redaction-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const store = new JobStore({
      databasePath,
      jobId: "job_redaction",
      taskType: "agent",
      workflowName: "redaction-test",
      title: "Redaction test",
      instruction: "Verify stored log redaction",
      status: "running",
      startedAt: new Date().toISOString(),
      input: {},
      budget: {},
      output: {}
    });
    store.appendRunEvent("log", "failed with password=plain-password", {
      apiKey: "example-provider-key"
    });
    store.setStatus("failed", {
      errorMessage: "provider rejected access_token=plain-access-token",
      completedAt: new Date().toISOString()
    });

    const events = listJobRunEvents({ databasePath, jobId: "job_redaction", limit: 10 });
    const storedError = getStoredJobDetail({ databasePath, jobId: "job_redaction" })?.job.errorMessage;
    assert.match(events[0]?.message ?? "", /password=\[REDACTED\]/);
    assert.doesNotMatch(JSON.stringify(events), /plain-password|example-provider-key/);
    assert.doesNotMatch(storedError ?? "", /plain-access-token/);
    assert.match(storedError ?? "", /access_token=\[REDACTED\]/);
  } finally {
    closeSharedJobDatabase(databasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
