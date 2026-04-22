import assert from "node:assert/strict";
import test from "node:test";

import { formatCliErrorMessage } from "../lib/cli-error";

test("cli error formatter gives workflow template hints", () => {
  const message = formatCliErrorMessage(new Error("Unknown workflow template: demo"));
  assert.match(message, /Run `web-task-agent workflow list`/);
});

test("cli error formatter gives env hints", () => {
  const message = formatCliErrorMessage(
    new Error("agent run needs an Anthropic-compatible API key")
  );
  assert.match(message, /Set ANTHROPIC_API_KEY/);
});

test("cli error formatter gives job and queue lookup hints", () => {
  const message = formatCliErrorMessage(new Error("Unknown queue item: queue_123"));
  assert.match(
    message,
    /Run `web-task-agent job inspect <job-id>`, `web-task-agent job report <job-id>`, `web-task-agent job budget <job-id>`, or `web-task-agent queue list`/
  );
});
