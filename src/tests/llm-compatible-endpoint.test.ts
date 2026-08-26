import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import type { AgentEvidenceBundle } from "../types";

function buildMinimalEvidence(): AgentEvidenceBundle {
  return {
    counts: { queries: 1, sources: 0, documents: 0, extractions: 0, clusters: 0, contradictions: 0 },
    queries: [
      {
        query: "local compatible endpoint",
        searchedAt: "2026-08-26T00:00:00.000Z",
        status: "completed",
        resultCount: 0,
        searchProvider: "fixture"
      }
    ],
    sources: [],
    highlights: { entities: [], themes: [], complaints: [], featureRequests: [], claims: [] },
    clusters: [],
    contradictions: []
  };
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

test("Anthropic-compatible local endpoint receives the expected Messages request", async () => {
  let received: { url?: string; apiKey?: string; body?: unknown } = {};
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received = {
        url: request.url,
        apiKey:
          typeof request.headers["x-api-key"] === "string"
            ? request.headers["x-api-key"]
            : undefined,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "msg_local_fixture",
          type: "message",
          role: "assistant",
          model: "local-compatible-fixture",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                executiveSummary: "The local endpoint accepted an Anthropic Messages request.",
                keyFindings: [],
                contentAngles: [],
                uncertainties: [],
                recommendations: []
              })
            }
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      );
    });
  });

  const previousEnv = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL
  };
  const llmModulePath = require.resolve("../lib/llm");

  try {
    const port = await listen(server);
    process.env.ANTHROPIC_API_KEY = "local-compatible-test-key";
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.ANTHROPIC_MODEL = "local-compatible-fixture";
    delete require.cache[llmModulePath];
    const { LlmService } = require("../lib/llm") as typeof import("../lib/llm");

    const summary = await new LlmService().synthesizeAgentEvidence({
      instruction: "Verify a local compatible endpoint.",
      evidence: buildMinimalEvidence()
    });

    assert.equal(received.url, "/v1/messages");
    assert.equal(received.apiKey, "local-compatible-test-key");
    assert.ok(received.body && typeof received.body === "object");
    const body = received.body as {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    assert.equal(body.model, "local-compatible-fixture");
    assert.equal(body.max_tokens, 3000);
    assert.equal(body.temperature, 0.2);
    assert.match(body.system, /persisted evidence bundle/i);
    assert.equal(body.messages[0]?.role, "user");
    assert.match(body.messages[0]?.content ?? "", /local compatible endpoint/i);
    assert.match(summary.executiveSummary, /local endpoint accepted/i);
  } finally {
    process.env.ANTHROPIC_API_KEY = previousEnv.apiKey;
    process.env.ANTHROPIC_BASE_URL = previousEnv.baseUrl;
    process.env.ANTHROPIC_MODEL = previousEnv.model;
    delete require.cache[llmModulePath];
    await close(server);
  }
});
