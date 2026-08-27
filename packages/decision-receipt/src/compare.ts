import type {
  DecisionReceipt,
  DecisionReceiptComparison,
  DecisionReceiptSource
} from "./types";

export function compareDecisionReceipts(
  earlier: DecisionReceipt,
  later: DecisionReceipt
): DecisionReceiptComparison {
  const earlierSources = new Map(earlier.sources.map((source) => [source.url, source]));
  const laterSources = new Map(later.sources.map((source) => [source.url, source]));
  const earlierClaims = new Map(earlier.claims.map((claim) => [claim.id, claim]));
  const laterClaims = new Map(later.claims.map((claim) => [claim.id, claim]));
  const changedClaims = [...new Set([...earlierClaims.keys(), ...laterClaims.keys()])]
    .map((id) => ({ id, earlier: earlierClaims.get(id) ?? null, later: laterClaims.get(id) ?? null }))
    .filter((item) => JSON.stringify(item.earlier) !== JSON.stringify(item.later));
  const newSources = [...laterSources.entries()]
    .filter(([url]) => !earlierSources.has(url))
    .map(([, source]) => source);
  const disappearedSources = [...earlierSources.entries()]
    .filter(([url]) => !laterSources.has(url))
    .map(([, source]) => source);
  const decisionChanged = earlier.decision.summary !== later.decision.summary;
  const changes = {
    sources: newSources.length > 0 || disappearedSources.length > 0,
    claims: changedClaims.length > 0,
    policy: earlier.provenance.policyVersion !== later.provenance.policyVersion,
    model: earlier.provenance.model !== later.provenance.model,
    prompt: earlier.provenance.promptVersion !== later.provenance.promptVersion,
    decision: decisionChanged
  };
  const changedBecause: string[] = [];
  if (newSources.length > 0) changedBecause.push(`${newSources.length} source(s) were added`);
  if (disappearedSources.length > 0) changedBecause.push(`${disappearedSources.length} source(s) disappeared`);
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
