import type {
  DecisionReceipt,
  DecisionReceiptComparison,
  DecisionReceiptEvidenceRef,
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
    source.snapshotPath,
    source.snapshotSha256
  ]);
  const sameSources = (left: DecisionReceiptSource[], right: DecisionReceiptSource[]) => {
    const keys = (items: DecisionReceiptSource[]) => items.map(sourceKey).sort();
    return JSON.stringify(keys(left)) === JSON.stringify(keys(right));
  };
  const sortSources = (sources: DecisionReceiptSource[]) => [...sources].sort((left, right) =>
    left.url < right.url ? -1 : left.url > right.url ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const earlierSources = groupSources(earlier.sources);
  const laterSources = groupSources(later.sources);
  const evidenceKey = (evidence: DecisionReceipt["claims"][number]["evidence"][number]) =>
    JSON.stringify([evidence.id, evidence.sourceId, evidence.excerpt, evidence.relation]);
  const claimKey = (claim: DecisionReceipt["claims"][number] | null) => claim === null ? null : JSON.stringify([
    claim.text,
    claim.status,
    claim.evidence.map(evidenceKey).sort(),
    claim.limitation ?? null
  ]);
  const earlierClaims = new Map(earlier.claims.map((claim) => [claim.id, claim]));
  const laterClaims = new Map(later.claims.map((claim) => [claim.id, claim]));
  const changedClaims = [...new Set([...earlierClaims.keys(), ...laterClaims.keys()])].sort()
    .map((id) => ({ id, earlier: earlierClaims.get(id) ?? null, later: laterClaims.get(id) ?? null }))
    .filter((item) => claimKey(item.earlier) !== claimKey(item.later));
  const contradictionKey = (item: DecisionReceipt["contradictions"][number] | null) => item === null ? null : JSON.stringify([
    item.topic,
    [...item.evidenceIds].sort(),
    item.note
  ]);
  const earlierContradictions = new Map(earlier.contradictions.map((item) => [item.id, item]));
  const laterContradictions = new Map(later.contradictions.map((item) => [item.id, item]));
  const changedContradictions = [...new Set([...earlierContradictions.keys(), ...laterContradictions.keys()])].sort()
    .map((id) => ({ id, earlier: earlierContradictions.get(id) ?? null, later: laterContradictions.get(id) ?? null }))
    .filter((item) => contradictionKey(item.earlier) !== contradictionKey(item.later));
  const unmatched = (items: string[], against: string[]) => {
    const counts = new Map<string, number>();
    for (const item of against) counts.set(item, (counts.get(item) ?? 0) + 1);
    return items.filter((item) => {
      const count = counts.get(item) ?? 0;
      if (count === 0) return true;
      if (count === 1) counts.delete(item);
      else counts.set(item, count - 1);
      return false;
    }).sort();
  };
  const addedLimitations = unmatched(later.limitations, earlier.limitations);
  const removedLimitations = unmatched(earlier.limitations, later.limitations);
  const nextValidationChange = earlier.nextValidation === later.nextValidation
    ? null
    : { earlier: earlier.nextValidation, later: later.nextValidation };
  const newSources = sortSources([...laterSources.entries()]
    .filter(([url]) => !earlierSources.has(url))
    .flatMap(([, sources]) => sources));
  const disappearedSources = sortSources([...earlierSources.entries()]
    .filter(([url]) => !laterSources.has(url))
    .flatMap(([, sources]) => sources));
  const changedSources = [...earlierSources.entries()].flatMap(([url, previous]) => {
    const current = laterSources.get(url);
    return current && !sameSources(previous, current)
      ? [{ url, earlier: sortSources(previous), later: sortSources(current) }]
      : [];
  }).sort((left, right) => left.url < right.url ? -1 : left.url > right.url ? 1 : 0);
  const decisionChanged = earlier.decision.title !== later.decision.title
    || earlier.decision.summary !== later.decision.summary;
  const changes = {
    sources: newSources.length > 0 || disappearedSources.length > 0 || changedSources.length > 0,
    claims: changedClaims.length > 0,
    contradictions: changedContradictions.length > 0,
    limitations: addedLimitations.length > 0 || removedLimitations.length > 0,
    nextValidation: nextValidationChange !== null,
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
  if (changedContradictions.length > 0) changedBecause.push(`${changedContradictions.length} contradiction(s) changed`);
  if (addedLimitations.length > 0) changedBecause.push(`${addedLimitations.length} limitation(s) added`);
  if (removedLimitations.length > 0) changedBecause.push(`${removedLimitations.length} limitation(s) removed`);
  if (nextValidationChange) changedBecause.push("the next validation changed");
  if (changes.policy) changedBecause.push("the source or acquisition policy changed");
  if (changes.model) changedBecause.push("the declared model changed");
  if (changes.prompt) changedBecause.push("the prompt or synthesis contract changed");
  if (decisionChanged) changedBecause.push("the decision title or summary changed");
  if (changedBecause.length === 0) changedBecause.push("no source, claim, contradiction, limitation, next validation, policy, model, prompt, or decision change was detected");
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
    changedContradictions,
    addedLimitations,
    removedLimitations,
    nextValidationChange,
    changes,
    changedBecause
  };
}

export function renderDecisionReceiptComparison(
  comparison: DecisionReceiptComparison,
  format: "markdown" | "json" = "markdown"
): string {
  if (format === "json") return `${JSON.stringify(comparison, null, 2)}\n`;
  const inlineCode = (value: string) => {
    const longestBackticks = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
    const delimiter = "`".repeat(longestBackticks + 1);
    return `${delimiter}${value}${delimiter}`;
  };
  const section = (title: string, lines: string[]) => lines.length > 0 ? [`## ${title}`, "", ...lines, ""] : [];
  const sourceLines = (items: DecisionReceiptSource[]) => items.map((source) =>
    `- ${inlineCode(JSON.stringify(source.title))} (${inlineCode(source.url)})`);
  const sourceFields = ["title", "publisher", "role", "collectedAt", "captureType", "snapshotPath", "snapshotSha256"] as const;
  const sourceValues = (sources: DecisionReceiptSource[], field: typeof sourceFields[number]) =>
    [...sources]
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      .map((source) => ({ id: source.id, value: source[field] }));
  const changedSourceLines = comparison.changedSources.flatMap(({ url, earlier, later }) => [
    `- ${inlineCode(url)}`,
    ...sourceFields.flatMap((field) => {
      const previous = sourceValues(earlier, field);
      const current = sourceValues(later, field);
      return JSON.stringify(previous) === JSON.stringify(current)
        ? []
        : [`  - ${field}: ${inlineCode(JSON.stringify(previous))} → ${inlineCode(JSON.stringify(current))}`];
    })
  ]);
  const evidenceKey = (item: DecisionReceiptEvidenceRef | null) => item === null
    ? null
    : JSON.stringify([item.sourceId, item.relation, item.excerpt]);
  const evidenceDescription = (item: DecisionReceiptEvidenceRef) =>
    `${item.relation} from ${inlineCode(item.sourceId)}: ${inlineCode(JSON.stringify(item.excerpt))}`;
  const claimLines = comparison.changedClaims.length > 0
    ? comparison.changedClaims.flatMap((item) => {
        const earlierClaim = item.earlier ? `${item.earlier.status}: ${inlineCode(JSON.stringify(item.earlier.text))}` : "(new)";
        const laterClaim = item.later ? `${item.later.status}: ${inlineCode(JSON.stringify(item.later.text))}` : "(removed)";
        const lines = [`- ${inlineCode(item.id)}: ${earlierClaim} → ${laterClaim}`];
        const earlierEvidence = new Map((item.earlier?.evidence ?? []).map((evidence) => [evidence.id, evidence]));
        const laterEvidence = new Map((item.later?.evidence ?? []).map((evidence) => [evidence.id, evidence]));
        for (const id of [...new Set([...earlierEvidence.keys(), ...laterEvidence.keys()])].sort()) {
          const earlier = earlierEvidence.get(id) ?? null;
          const later = laterEvidence.get(id) ?? null;
          if (evidenceKey(earlier) === evidenceKey(later)) continue;
          lines.push(`  - Evidence ${inlineCode(id)}: ${earlier ? evidenceDescription(earlier) : "(new)"} → ${later ? evidenceDescription(later) : "(removed)"}`);
        }
        if (item.earlier?.limitation !== item.later?.limitation) {
          const earlierLimitation = item.earlier?.limitation ? inlineCode(JSON.stringify(item.earlier.limitation)) : "(none)";
          const laterLimitation = item.later?.limitation ? inlineCode(JSON.stringify(item.later.limitation)) : "(none)";
          lines.push(`  - Claim limitation: ${earlierLimitation} → ${laterLimitation}`);
        }
        return lines;
      })
    : [];
  const contradictionDescription = (item: DecisionReceipt["contradictions"][number]) =>
    `${inlineCode(JSON.stringify(item.topic))}: ${inlineCode(JSON.stringify(item.note))} (evidence: ${item.evidenceIds.map(inlineCode).join(", ") || "none"})`;
  const contradictionLines = comparison.changedContradictions.length > 0
    ? comparison.changedContradictions.map(({ id, earlier, later }) =>
        `- ${inlineCode(id)}: ${earlier ? contradictionDescription(earlier) : "(new)"} → ${later ? contradictionDescription(later) : "(removed)"}`)
    : [];
  const nextValidationLines = comparison.nextValidationChange
    ? [`- Earlier: ${inlineCode(JSON.stringify(comparison.nextValidationChange.earlier))}`, `- Later: ${inlineCode(JSON.stringify(comparison.nextValidationChange.later))}`]
    : [];
  return [
    `# Decision diff — ${inlineCode(JSON.stringify(comparison.earlierTitle))} → ${inlineCode(JSON.stringify(comparison.laterTitle))}`,
    "",
    `- Earlier receipt: ${comparison.earlierGeneratedAt}`,
    `- Later receipt: ${comparison.laterGeneratedAt}`,
    `- Decision changed: ${comparison.decisionChanged ? "yes" : "no"}`,
    `- Contradictions changed: ${comparison.changedContradictions.length}`,
    `- Limitations added/removed: ${comparison.addedLimitations.length}/${comparison.removedLimitations.length}`,
    `- Next validation changed: ${comparison.changes.nextValidation ? "yes" : "no"}`,
    `- Policy changed: ${comparison.changes.policy ? "yes" : "no"}`,
    `- Model changed: ${comparison.changes.model ? "yes" : "no"}`,
    `- Prompt contract changed: ${comparison.changes.prompt ? "yes" : "no"}`,
    "",
    "## Changes detected",
    "",
    ...comparison.changedBecause.map((reason) => `- ${reason}.`),
    "",
    ...section("New sources", sourceLines(comparison.newSources)),
    ...section("Sources no longer present", sourceLines(comparison.disappearedSources)),
    ...section("Existing sources changed", changedSourceLines),
    ...section("Changed claims", claimLines),
    ...section("Changed contradictions", contradictionLines),
    ...section("Limitations added", comparison.addedLimitations.map((item) => `- ${inlineCode(JSON.stringify(item))}`)),
    ...section("Limitations removed", comparison.removedLimitations.map((item) => `- ${inlineCode(JSON.stringify(item))}`)),
    ...section("Next validation changed", nextValidationLines),
    "## Review before relying on the later decision",
    "",
    "- Re-open the changed source excerpts and check their collection dates.",
    "- Resolve any contradiction that remains unresolved in the later receipt.",
    "- Run the later receipt's smallest next validation before treating the change as settled."
  ].join("\n") + "\n";
}
