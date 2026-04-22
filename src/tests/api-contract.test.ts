import assert from "node:assert/strict";
import test from "node:test";

import {
  createApiError,
  isJobControlAction,
  isQueueControlAction
} from "../server/api-contract";

test("api contract helpers recognize the supported control actions", () => {
  assert.equal(isJobControlAction("pause"), true);
  assert.equal(isJobControlAction("resume"), true);
  assert.equal(isJobControlAction("retry"), false);
  assert.equal(isQueueControlAction("retry"), true);
  assert.equal(isQueueControlAction("rerun"), false);
});

test("api contract errors stay structured", () => {
  const payload = createApiError("invalid_action", "Unsupported action", {
    allowedActions: ["pause", "resume"]
  });

  assert.deepEqual(payload, {
    ok: false,
    error: "invalid_action",
    message: "Unsupported action",
    allowedActions: ["pause", "resume"]
  });
});
