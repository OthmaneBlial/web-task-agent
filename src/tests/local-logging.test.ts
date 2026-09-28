import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendStructuredLog } from "../lib/local-logging";

test("structured local logging writes jsonl entries", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-local-logging-"));
  const logPath = path.join(tempDir, "logs.jsonl");

  try {
    appendStructuredLog(
      {
        timestamp: "2026-04-22T12:00:00.000Z",
        level: "info",
        scope: "unit-test",
        message: "structured message",
        details: {
          jobId: "job_1"
        }
      },
      logPath
    );

    const output = fs.readFileSync(logPath, "utf8").trim();
    const [firstLine] = output.split("\n");
    const parsed = JSON.parse(firstLine) as {
      scope: string;
      level: string;
      message: string;
      details: { jobId: string };
    };

    assert.equal(parsed.scope, "unit-test");
    assert.equal(parsed.level, "info");
    assert.equal(parsed.message, "structured message");
    assert.equal(parsed.details.jobId, "job_1");
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(logPath).mode & 0o777, 0o600);
      fs.chmodSync(logPath, 0o644);
      appendStructuredLog({
        timestamp: "2026-04-22T12:00:01.000Z",
        level: "info",
        scope: "unit-test",
        message: "existing log"
      }, logPath);
      assert.equal(fs.statSync(logPath).mode & 0o777, 0o600);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("structured local logging rejects FIFO paths without blocking", { skip: process.platform === "win32" }, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-local-logging-fifo-"));
  const fifoPath = path.join(tempDir, "logs.jsonl");

  try {
    const createdFifo = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
    assert.equal(createdFifo.status, 0, createdFifo.stderr);

    const modulePath = JSON.stringify(path.resolve(__dirname, "../lib/local-logging.js"));
    const childScript = `require(${modulePath}).appendStructuredLog({timestamp:"2026-04-22T12:00:00.000Z",level:"info",scope:"test",message:"fifo"},process.argv[1]);`;
    const result = spawnSync(process.execPath, ["-e", childScript, fifoPath], {
      encoding: "utf8",
      timeout: 2_000
    });

    assert.equal(result.error, undefined, result.error?.message ?? "FIFO logger child process failed");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENXIO|refusing unsafe structured log file/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
