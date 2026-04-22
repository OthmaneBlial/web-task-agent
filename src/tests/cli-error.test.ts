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
