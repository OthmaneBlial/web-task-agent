import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendStructuredLog } from "../lib/local-logging";
import { redactSensitiveText, redactSensitiveValue } from "../lib/redaction";

test("redaction removes common API and GitHub tokens from text and nested log details", () => {
  const raw = "ANTHROPIC_API_KEY=sk-ant-example_token_123456 ghp_123456789012345678901234567890";
  const redacted = redactSensitiveText(raw);

  assert.match(redacted, /ANTHROPIC_API_KEY=\[REDACTED\]/);
  assert.doesNotMatch(redacted, /sk-ant-example/);
  assert.doesNotMatch(redacted, /ghp_123/);
  assert.deepEqual(redactSensitiveValue({ token: "Bearer abcdefghijklmnop", nested: [raw] }), {
    token: "[REDACTED]",
    nested: [redacted]
  });
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
      details: { apiKey: "sk-ant-example_token_123456" }
    }, logPath);
    const persisted = fs.readFileSync(logPath, "utf8");
    assert.doesNotMatch(persisted, /abcdefghijklmnop|sk-ant-example/);
    assert.match(persisted, /\[REDACTED\]/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
