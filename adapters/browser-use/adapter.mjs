const requiredString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
};

const exactCapturedText = (raw, value, label) => {
  const text = requiredString(value, label);
  const markdown = requiredString(raw.source?.markdown, "source.markdown");
  if (!markdown.includes(text)) throw new Error(`${label} is not present verbatim in Browser Use markdown`);
  return text;
};

export function adaptBrowserUse(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Browser Use result must be an object");
  if (raw.engine !== "Browser Use") throw new Error("expected a Browser Use engine result");
  if (raw.limits?.authenticatedSession !== false) throw new Error("authenticated Browser Use sessions are outside this adapter boundary");
  if (raw.limits?.telemetry !== false || raw.limits?.cloudSync !== false) throw new Error("telemetry and cloud sync must be disabled");
  const heading = exactCapturedText(raw, raw.modelOutput?.heading, "modelOutput.heading");
  const paragraph = exactCapturedText(raw, raw.modelOutput?.paragraph, "modelOutput.paragraph");
  const claim = requiredString(raw.modelOutput?.claim, "modelOutput.claim");
  return {
    adapterContractVersion: "1.0.0",
    producer: {
      adapterId: "browser-use-public-page",
      adapterVersion: "1.0.0",
      engine: "Browser Use",
      engineVersion: requiredString(raw.engineVersion, "engineVersion"),
      runId: requiredString(raw.runId, "runId"),
      exportedAt: requiredString(raw.finishedAt, "finishedAt"),
      fixture: false
    },
    decision: {
      title: `Can this captured page support a bounded documentation claim?`,
      summary: `Yes, for the narrow claim that ${claim.charAt(0).toLowerCase()}${claim.slice(1)}`,
      nextValidation: "Repeat the same capture against a second public documentation page before generalizing beyond this single source.",
      origin: {
        kind: "operator-attested",
        note: "The adapter author framed the decision and next validation around the actual bounded run."
      }
    },
    sources: [{
      id: "example-domain",
      title: heading,
      url: requiredString(raw.source?.url, "source.url"),
      publisher: "Internet Assigned Numbers Authority",
      role: "redistributable public documentation example",
      collectedAt: requiredString(raw.finishedAt, "finishedAt"),
      excerpt: paragraph,
      origin: {
        kind: "captured",
        note: null
      }
    }],
    claims: [{
      id: "page-is-for-documentation-examples",
      text: claim,
      status: "supported",
      origin: {
        kind: "inferred",
        note: `The local ${requiredString(raw.model, "model")} model summarized the captured paragraph; the adapter separately requires the evidence excerpt to occur verbatim in the page markdown.`
      },
      evidence: [{
        id: "browser-use-captured-paragraph",
        sourceId: "example-domain",
        excerpt: paragraph,
        relation: "supports",
        origin: {
          kind: "captured",
          note: null
        }
      }]
    }],
    contradictions: [],
    limitations: [
      "This run captured one intentionally simple public page and cannot establish broader Browser Use interoperability.",
      "The 0.6B local model produced a narrow summary; the adapter verifies only that its cited excerpt exists verbatim in captured markdown.",
      "No authenticated session, screenshot, raw network trace, or provider prompt is included.",
      "Receipt integrity does not prove that the page or inferred claim is true, complete, representative, or fresh."
    ],
    policyVersion: "browser-use-public-page-v1",
    model: requiredString(raw.model, "model")
  };
}
