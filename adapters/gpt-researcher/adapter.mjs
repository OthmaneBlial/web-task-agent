const requiredString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
};

const sha256 = (value, label) => {
  const digest = requiredString(value, label);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return digest;
};

const EXPECTED_EXCERPT = "Verification is offline and deterministic. A valid status means the package is internally consistent; it is not a fact-check, freshness guarantee, or authorization check.";

export function adaptGptResearcher(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("GPT Researcher result must be an object");
  if (raw.engine !== "GPT Researcher") throw new Error("expected a GPT Researcher engine result");
  if (raw.limits?.authenticatedSession !== false || raw.limits?.webSearch !== false || raw.limits?.mcp !== false) {
    throw new Error("this adapter accepts only the bounded local, unauthenticated, no-web run");
  }
  if (raw.limits?.retrievalSkippedToAvoidSecondEmbeddingModel !== true || raw.limits?.rawReasoningPublished !== false) {
    throw new Error("the low-disk and private-reasoning boundaries must be explicit");
  }
  if (raw.reasoningRedacted !== true) throw new Error("the recorded run must attest that its reasoning trace was redacted");
  if (!Array.isArray(raw.visitedUrls) || raw.visitedUrls.length !== 0) throw new Error("preloaded-context run must not contain visited URLs");

  const excerpt = requiredString(raw.source?.excerpt, "source.excerpt");
  if (excerpt !== EXPECTED_EXCERPT) throw new Error("source.excerpt does not match the reviewed trust-model bytes");
  sha256(raw.source?.documentSha256, "source.documentSha256");
  sha256(raw.rawReportSha256, "rawReportSha256");
  const report = requiredString(raw.reportProjection, "reportProjection");
  if (/<\/?think\b/i.test(report)) throw new Error("reportProjection contains a private reasoning trace");
  for (const phrase of [
    "Verification is offline and deterministic",
    "internally consistent",
    "not a fact-check",
    "freshness guarantee",
    "authorization check"
  ]) {
    if (!report.includes(phrase)) throw new Error(`reportProjection is missing the bounded finding: ${phrase}`);
  }

  return {
    adapterContractVersion: "1.0.0",
    producer: {
      adapterId: "gpt-researcher-preloaded-context",
      adapterVersion: "1.0.0",
      engine: "GPT Researcher",
      engineVersion: requiredString(raw.engineVersion, "engineVersion"),
      runId: requiredString(raw.runId, "runId"),
      exportedAt: requiredString(raw.finishedAt, "finishedAt"),
      fixture: false
    },
    decision: {
      title: "Does a valid offline receipt verification establish factual truth?",
      summary: "No. The imported report limits a valid status to internal consistency and explicitly excludes fact-checking, freshness, and authorization.",
      nextValidation: "Give the same receipt to an independent reviewer and measure whether they preserve this limitation when explaining its verification status.",
      origin: {
        kind: "operator-attested",
        note: "The adapter author framed the decision around the exact public trust-model excerpt and the authentic engine report."
      }
    },
    sources: [{
      id: "web-task-agent-trust-model",
      title: requiredString(raw.source?.title, "source.title"),
      url: requiredString(raw.source?.url, "source.url"),
      publisher: "OthmaneBlial/web-task-agent maintainers",
      role: "redistributable repository documentation supplied as bounded local context",
      collectedAt: requiredString(raw.finishedAt, "finishedAt"),
      excerpt,
      origin: {
        kind: "captured",
        note: null
      }
    }],
    claims: [{
      id: "verification-is-not-truth",
      text: "A valid offline Decision Receipt verification establishes internal consistency, not factual truth, freshness, or authorization.",
      status: "supported",
      origin: {
        kind: "inferred",
        note: `The authentic ${requiredString(raw.engineVersion, "engineVersion")} report reproduced every bounded limitation; the adapter separately pins the exact source excerpt and document hash.`
      },
      evidence: [{
        id: "trust-model-verification-boundary",
        sourceId: "web-task-agent-trust-model",
        excerpt,
        relation: "supports",
        origin: {
          kind: "captured",
          note: null
        }
      }]
    }],
    contradictions: [],
    limitations: [
      "This is one short preloaded-context report, not a benchmark of GPT Researcher retrieval, browsing, citation discovery, or multi-source synthesis.",
      "Retrieval was deliberately skipped so the run reused the only installed 0.6B Ollama model instead of downloading a second embedding model.",
      "The PyPI 0.16.0 import-order defect required the documented two-import patch; the optional MCP adapter warning was ignored because MCP was disabled.",
      "The 0.6B model emitted a reasoning trace despite /no_think; the projection removes it and preserves only its SHA-256, never the private trace.",
      "GPT Researcher's cost number is a static estimate; this local Ollama run made no billed provider call.",
      "Receipt integrity does not prove that the supplied source or inferred claim is true, complete, representative, or fresh."
    ],
    policyVersion: "gpt-researcher-preloaded-local-v1",
    model: requiredString(raw.model, "model")
  };
}
