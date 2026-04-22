import assert from "node:assert/strict";
import test from "node:test";

import { injectFailure, shouldInjectFailure } from "../lib/failure-injection";

test("failure injection helper stays opt-in", () => {
  const previous = process.env.WEB_TASK_AGENT_FAIL_POINT;

  try {
    delete process.env.WEB_TASK_AGENT_FAIL_POINT;
    assert.equal(shouldInjectFailure("agent-runner.run"), false);
    assert.doesNotThrow(() => injectFailure("agent-runner.run"));

    process.env.WEB_TASK_AGENT_FAIL_POINT = "queue-worker.run";
    assert.equal(shouldInjectFailure("queue-worker.run"), true);
    assert.equal(shouldInjectFailure("agent-runner.run"), false);
    assert.throws(() => injectFailure("queue-worker.run"), /Injected failure at queue-worker\.run/);
  } finally {
    if (previous === undefined) {
      delete process.env.WEB_TASK_AGENT_FAIL_POINT;
    } else {
      process.env.WEB_TASK_AGENT_FAIL_POINT = previous;
    }
  }
});
