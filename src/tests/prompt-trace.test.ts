import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createPromptTraceRecorder } from "../lib/prompt-trace";

test("prompt trace recorder persists local prompt/version history", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-prompt-trace-"));
  const tracePath = path.join(tempDir, "runtime", "llm-prompt-traces.json");
  const events: Array<{ eventType: string; message: string }> = [];

  try {
    const recorder = createPromptTraceRecorder({
      outputPath: tracePath,
      appendRunEvent: (eventType, message) => {
        events.push({ eventType, message });
      }
    });
    const hooks = recorder.createHooks();

    hooks.onStart?.({
      traceId: "llm_trace_001",
      operation: "agent_plan",
      promptVersion: "agent_plan.v1",
      model: "claude-sonnet-4-20250514",
      maxTokens: 3000,
      createdAt: "2026-03-20T12:00:00.000Z",
      system: "system prompt",
      prompt: "user prompt"
    });
    hooks.onSuccess?.({
      traceId: "llm_trace_001",
      operation: "agent_plan",
      promptVersion: "agent_plan.v1",
      model: "claude-sonnet-4-20250514",
      maxTokens: 3000,
      createdAt: "2026-03-20T12:00:00.000Z",
      completedAt: "2026-03-20T12:00:01.000Z",
      durationMs: 1000,
      system: "system prompt",
      prompt: "user prompt",
      responseText: "{\"summary\":\"ok\"}"
    });

    hooks.onStart?.({
      traceId: "llm_trace_002",
      operation: "agent_post_draft",
      promptVersion: "agent_post_draft.v1",
      model: "claude-sonnet-4-20250514",
      maxTokens: 2500,
      createdAt: "2026-03-20T12:01:00.000Z",
      system: "draft system prompt",
      prompt: "draft user prompt"
    });
    hooks.onError?.({
      traceId: "llm_trace_002",
      operation: "agent_post_draft",
      promptVersion: "agent_post_draft.v1",
      model: "claude-sonnet-4-20250514",
      maxTokens: 2500,
      createdAt: "2026-03-20T12:01:00.000Z",
      completedAt: "2026-03-20T12:01:02.000Z",
      durationMs: 2000,
      system: "draft system prompt",
      prompt: "draft user prompt",
      errorMessage: "network timeout"
    });

    const manifest = JSON.parse(fs.readFileSync(tracePath, "utf8")) as {
      traces: Array<{
        traceId: string;
        operation: string;
        promptVersion: string;
        status: string;
        responseText: string | null;
        responseHash: string | null;
        errorMessage: string | null;
      }>;
    };

    assert.equal(manifest.traces.length, 2);
    assert.deepEqual(
      manifest.traces.map((trace) => ({
        traceId: trace.traceId,
        operation: trace.operation,
        promptVersion: trace.promptVersion,
        status: trace.status
      })),
      [
        {
          traceId: "llm_trace_001",
          operation: "agent_plan",
          promptVersion: "agent_plan.v1",
          status: "completed"
        },
        {
          traceId: "llm_trace_002",
          operation: "agent_post_draft",
          promptVersion: "agent_post_draft.v1",
          status: "failed"
        }
      ]
    );
    assert.equal(manifest.traces[0]?.responseText, "{\"summary\":\"ok\"}");
    assert.ok(manifest.traces[0]?.responseHash);
    assert.equal(manifest.traces[1]?.errorMessage, "network timeout");
    assert.ok(events.some((event) => event.eventType === "llm_prompt_start"));
    assert.ok(events.some((event) => event.eventType === "llm_prompt_complete"));
    assert.ok(events.some((event) => event.eventType === "llm_prompt_error"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
