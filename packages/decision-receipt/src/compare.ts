import type {
  DecisionReceipt,
  DecisionReceiptComparison,
  DecisionReceiptSource
} from "./types";

export function compareDecisionReceipts(
  earlier: DecisionReceipt,
  later: DecisionReceipt
): DecisionReceiptComparison {
  const groupSources = (sources: DecisionReceiptSource[]) => {
    const grouped = new Map<string, DecisionReceiptSource[]>();
    for (const source of sources) {
      const group = grouped.get(source.url);
      if (group) group.push(source);
      else grouped.set(source.url, [source]);
    }
    return grouped;
  };
  const sourceKey = (source: DecisionReceiptSource) => JSON.stringify([
    source.title,
    source.publisher,
    source.role,
    source.collectedAt,
    source.captureType,
    source.snapshotSha256
  ]);
  const sameSources = (left: DecisionReceiptSource[], right: DecisionReceiptSource[]) => {
    const keys = (items: DecisionReceiptSource[]) => items.map(sourceKey).sort();
    return JSON.stringify(keys(left)) === JSON.stringify(keys(right));
  };
  const earlierSources = groupSources(earlier.sources);
  const laterSources = groupSources(later.sources);
  const earlierClaims = new Map(earlier.claims.map((claim) => [claim.id, claim]));
  const laterClaims = new Map(later.claims.map((claim) => [claim.id, claim]));
  const changedClaims = [...new Set([...earlierClaims.keys(), ...laterClaims.keys()])]
    .map((id) => ({ id, earlier: earlierClaims.get(id) ?? null, later: laterClaims.get(id) ?? null }))
    .filter((item) => JSON.stringify(item.earlier) !== JSON.stringify(item.later));
  const newSources = [...laterSources.entries()]
    .filter(([url]) => !earlierSources.has(url))
    .flatMap(([, sources]) => sources);
  const disappearedSources = [...earlierSources.entries()]
    .filter(([url]) => !laterSources.has(url))
    .flatMap(([, sources]) => sources);
  const changedSources = [...earlierSources.entries()].flatMap(([url, previous]) => {
    const current = laterSources.get(url);
    return current && !sameSources(previous, current) ? [{ url, earlier: previous, later: current }] : [];
  });
  const decisionChanged = earlier.decision.summary !== later.decision.summary;
  const changes = {
    sources: newSources.length > 0 || disappearedSources.length > 0 || changedSources.length > 0,
    claims: changedClaims.length > 0,
    policy: earlier.provenance.policyVersion !== later.provenance.policyVersion,
    model: earlier.provenance.model !== later.provenance.model,
    prompt: earlier.provenance.promptVersion !== later.provenance.promptVersion,
    decision: decisionChanged
  };
  const changedBecause: string[] = [];
  if (newSources.length > 0) changedBecause.push(`${newSources.length} source(s) were added`);
  if (disappearedSources.length > 0) changedBecause.push(`${disappearedSources.length} source(s) disappeared`);
  if (changedSources.length > 0) {
    const label = changedSources.length === 1 ? "source URL" : "source URLs";
    changedBecause.push(`${changedSources.length} existing ${label} changed`);
  }
  if (changedClaims.length > 0) changedBecause.push(`${changedClaims.length} evidence-backed claim(s) changed`);
  if (changes.policy) changedBecause.push("the source or acquisition policy changed");
  if (changes.model) changedBecause.push("the declared model changed");
  if (changes.prompt) changedBecause.push("the prompt or synthesis contract changed");
  if (decisionChanged) changedBecause.push("the decision summary changed");
  if (changedBecause.length === 0) changedBecause.push("no source, claim, policy, model, prompt, or decision change was detected");
  return {
    earlierTitle: earlier.decision.title,
    laterTitle: later.decision.title,
    earlierGeneratedAt: earlier.generatedAt,
    laterGeneratedAt: later.generatedAt,
    decisionChanged,
    newSources,
    disappearedSources,
    changedSources,
    changedClaims,
    changes,
    changedBecause
  };
}

export function renderDecisionReceiptComparison(
  comparison: DecisionReceiptComparison,
  format: "markdown" | "json" = "markdown"
): string {
  if (format === "json") return `${JSON.stringify(comparison, null, 2)}\n`;
  const sourceLines = (items: DecisionReceiptSource[]) =>
    items.length > 0 ? items.map((source) => `- [${source.title}](${source.url})`) : ["- None."];
  const changedSourceLines = comparison.changedSources.length > 0
    ? comparison.changedSources.map(({ url, earlier, later }) =>
        `- ${url}: snapshot or source details changed (${earlier.length} earlier, ${later.length} later).`)
    : ["- None."];
  const claimLines = comparison.changedClaims.length > 0
    ? comparison.changedClaims.map((item) => `- \`${item.id}\`: ${item.earlier?.text ?? "(new)"} → ${item.later?.text ?? "(removed)"}`)
    : ["- None."];
  return [
    `# Decision diff — ${comparison.earlierTitle} → ${comparison.laterTitle}`,
    "",
    `- Earlier receipt: ${comparison.earlierGeneratedAt}`,
    `- Later receipt: ${comparison.laterGeneratedAt}`,
    `- Decision changed: ${comparison.decisionChanged ? "yes" : "no"}`,
    `- Policy changed: ${comparison.changes.policy ? "yes" : "no"}`,
    `- Model changed: ${comparison.changes.model ? "yes" : "no"}`,
    `- Prompt contract changed: ${comparison.changes.prompt ? "yes" : "no"}`,
    "",
    "## Decision changed because",
    "",
    ...comparison.changedBecause.map((reason) => `- ${reason}.`),
    "",
    "## New sources",
    "",
    ...sourceLines(comparison.newSources),
    "",
    "## Sources no longer present",
    "",
    ...sourceLines(comparison.disappearedSources),
    "",
    "## Existing sources changed",
    "",
    ...changedSourceLines,
    "",
    "## Changed claims",
    "",
    ...claimLines,
    "",
    "## Review before relying on the later decision",
    "",
    "- Re-open the changed source excerpts and check their collection dates.",
    "- Resolve any contradiction that remains unresolved in the later receipt.",
    "- Run the later receipt's smallest next validation before treating the change as settled."
  ].join("\n") + "\n";
}
