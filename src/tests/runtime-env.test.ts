import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureLlmRuntimeEnvironment,
  getFirstConfiguredEnvValue,
  parseLlmTimeoutMs
} from "../lib/runtime-env";

test("runtime env helper returns the first configured value", () => {
  const value = getFirstConfiguredEnvValue(["NOT_SET", "ALSO_NOT_SET", "PATH"]);
  assert.equal(typeof value, "string");
  assert.ok(value && value.length > 0);
});

test("runtime env helper rejects missing llm api keys with a clear message", () => {
  const previousValues = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ZAI_API_KEY: process.env.ZAI_API_KEY,
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN
  };

  try {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ZAI_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    assert.throws(
      () => ensureLlmRuntimeEnvironment("agent run"),
      /agent run needs an Anthropic-compatible API key/
    );
  } finally {
    process.env.ANTHROPIC_API_KEY = previousValues.ANTHROPIC_API_KEY;
    process.env.ZAI_API_KEY = previousValues.ZAI_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = previousValues.ANTHROPIC_AUTH_TOKEN;
  }
});

test("LLM timeout uses its default when unset and accepts bounded integer milliseconds", () => {
  assert.equal(parseLlmTimeoutMs(undefined), 90_000);
  assert.equal(parseLlmTimeoutMs(""), 90_000);
  assert.equal(parseLlmTimeoutMs("120000"), 120_000);
  assert.equal(parseLlmTimeoutMs("600000"), 600_000);
});

test("LLM timeout rejects invalid and overlong values", () => {
  for (const value of ["NaN", "Infinity", "0", "-1", "1.5", "600001"]) {
    assert.throws(() => parseLlmTimeoutMs(value), /ANTHROPIC_TIMEOUT_MS must be a whole number/);
  }
});
