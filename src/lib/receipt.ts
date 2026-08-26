import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ensureDir, writeJsonAtomic } from "./cache";
import type { AgentEvidenceBundle, AgentRunState } from "../types";

export const DECISION_RECEIPT_SCHEMA_VERSION = 1;
export const RECEIPT_HASH_ALGORITHM = "sha256" as const;

export type ReceiptClaimStatus = "supported" | "contradicted" | "insufficient";

export interface DecisionReceiptSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  role: string;
  collectedAt: string | null;
  captureType: "live" | "fixture-synthetic" | "metadata-only";
  snapshotPath: string | null;
  snapshotSha256: string | null;
}

export interface DecisionReceiptEvidenceRef {
  id: string;
  sourceId: string;
  excerpt: string;
  relation: "supports" | "contradicts" | "context";
}

export interface DecisionReceiptClaim {
  id: string;
  text: string;
  status: ReceiptClaimStatus;
  evidence: DecisionReceiptEvidenceRef[];
  limitation?: string;
}

export interface DecisionReceipt {
  schemaVersion: typeof DECISION_RECEIPT_SCHEMA_VERSION;
  type: "decision-receipt";
  generatedAt: string;
  provenance: {
    kind: "live" | "deterministic-demo" | "imported";
    runId: string | null;
    cliVersion: string | null;
    workflowId: string | null;
    policyVersion: string | null;
    promptVersion: string | null;
    model: string | null;
    fixture: boolean;
  };
  decision: {
    title: string;
    summary: string;
  };
  claims: DecisionReceiptClaim[];
  sources: DecisionReceiptSource[];
  contradictions: Array<{
    id: string;
    topic: string;
    evidenceIds: string[];
    note: string;
  }>;
  nextValidation: string;
  limitations: string[];
  integrity: {
    algorithm: typeof RECEIPT_HASH_ALGORITHM;
    manifestPath: "integrity-manifest.json";
    note: string;
  };
}

export interface ReceiptIntegrityManifestFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface ReceiptIntegrityManifest {
  schemaVersion: typeof DECISION_RECEIPT_SCHEMA_VERSION;
  type: "receipt-integrity-manifest";
  algorithm: typeof RECEIPT_HASH_ALGORITHM;
  receiptPath: "receipt.json";
  generatedAt: string;
  files: ReceiptIntegrityManifestFile[];
}

export interface ReceiptVerificationResult {
  valid: boolean;
  rootDir: string;
  checkedFiles: number;
  errors: string[];
  receipt: DecisionReceipt | null;
}

export interface DecisionReceiptComparison {
  earlierTitle: string;
  laterTitle: string;
  earlierGeneratedAt: string;
  laterGeneratedAt: string;
  decisionChanged: boolean;
  newSources: DecisionReceiptSource[];
  disappearedSources: DecisionReceiptSource[];
  changedClaims: Array<{
    id: string;
    earlier: DecisionReceiptClaim | null;
    later: DecisionReceiptClaim | null;
  }>;
  changedBecause: string[];
}

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
  const changedBecause: string[] = [];
  if (newSources.length > 0) {
    changedBecause.push(`${newSources.length} source(s) were added`);
  }
  if (disappearedSources.length > 0) {
    changedBecause.push(`${disappearedSources.length} source(s) disappeared`);
  }
  if (changedClaims.length > 0) {
    changedBecause.push(`${changedClaims.length} evidence-backed claim(s) changed`);
  }
  if (decisionChanged) {
    changedBecause.push("the decision summary changed");
  }
  if (changedBecause.length === 0) {
    changedBecause.push("no source, claim, or decision change was detected");
  }
  return {
    earlierTitle: earlier.decision.title,
    laterTitle: later.decision.title,
    earlierGeneratedAt: earlier.generatedAt,
    laterGeneratedAt: later.generatedAt,
    decisionChanged,
    newSources,
    disappearedSources,
    changedClaims,
    changedBecause
  };
}

export function renderDecisionReceiptComparison(
  comparison: DecisionReceiptComparison,
  format: "markdown" | "json" = "markdown"
): string {
  if (format === "json") {
    return `${JSON.stringify(comparison, null, 2)}\n`;
  }
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

export interface FixtureReceiptInput {
  id: string;
  title: string;
  scenario: string;
  report: string;
  sources: Array<{
    title: string;
    url: string;
    publisher: string;
    accessedAt: string;
    role: string;
  }>;
  generatedAt: string;
}

export interface FixtureReceiptPaths {
  receiptPath: string;
  integrityManifestPath: string;
  reportPath: string;
  workflowBriefPath: string;
  sourcesPath: string;
  packageManifestPath: string;
  packageReadmePath: string;
  snapshotPaths: string[];
}

export function buildAgentDecisionReceipt(input: {
  state: AgentRunState;
  evidence: AgentEvidenceBundle;
  cliVersion?: string | null;
  receiptPath: string;
}): DecisionReceipt {
  const { state, evidence } = input;
  const evidenceById = new Map<string, { sourceId: string; text: string }>();
  for (const source of evidence.sources) {
    for (const extraction of source.extractions) {
      evidenceById.set(extraction.id, {
        sourceId: source.sourceId,
        text: extraction.evidenceText || extraction.value || source.snippet || source.title
      });
    }
    evidenceById.set(`source:${source.sourceId}`, {
      sourceId: source.sourceId,
      text: source.snippet || source.paragraphs[0] || source.title
    });
  }
  const referenced = new Map(
    (state.researchSummary?.referencedEvidence ?? []).map((item) => [item.id, item])
  );
  const sourceItems: DecisionReceiptSource[] = evidence.sources.map((source) => ({
    id: source.sourceId,
    title: source.title,
    url: source.canonicalUrl || source.url,
    publisher: source.site,
    role: source.contentType,
    collectedAt: source.capturedAt ?? null,
    captureType: "live",
    snapshotPath: null,
    snapshotSha256: null
  }));
  const sourceIds = new Set(sourceItems.map((source) => source.id));
  const claims = (state.researchSummary?.keyFindingDetails ?? []).map((finding, index) => {
    const references: DecisionReceiptEvidenceRef[] = finding.evidenceIds
      .map((evidenceId): DecisionReceiptEvidenceRef | null => {
        const direct = evidenceById.get(evidenceId);
        const linked = referenced.get(evidenceId);
        const sourceId = direct?.sourceId ?? linked?.sourceId;
        if (!sourceId || !sourceIds.has(sourceId)) {
          return null;
        }
        return {
          id: `evidence-${index + 1}-${evidenceId}`,
          sourceId,
          excerpt: direct?.text || linked?.value || finding.text,
          relation: "supports" as const
        } satisfies DecisionReceiptEvidenceRef;
      })
      .filter((item): item is DecisionReceiptEvidenceRef => Boolean(item));
    return {
      id: `claim-${index + 1}`,
      text: finding.text,
      status: references.length > 0 ? ("supported" as const) : ("insufficient" as const),
      evidence: references.length > 0
        ? references
        : [{
            id: `evidence-${index + 1}-insufficient`,
            sourceId: sourceItems[0]?.id ?? "",
            excerpt: finding.text,
            relation: "context" as const
          }],
      limitation: references.length > 0 ? undefined : "No persisted source reference was attached to this finding."
    };
  }).filter((claim) => claim.evidence[0]?.sourceId);
  const contradictions = evidence.contradictions.map((item) => ({
    id: item.id,
    topic: item.topic,
    evidenceIds: item.evidenceIds,
    note: item.reason
  }));
  const limitations = [
    "A live receipt records the inputs and policy decisions observed by this run; it does not prove that a web source is true or complete.",
    ...(state.status === "completed" ? [] : [`Run status is ${state.status}; review incomplete stages before relying on the decision.`]),
    ...(sourceItems.length === 0 ? ["No source was persisted for this run; every resulting conclusion is insufficient until validated."] : [])
  ];
  return {
    schemaVersion: DECISION_RECEIPT_SCHEMA_VERSION,
    type: "decision-receipt",
    generatedAt: state.updatedAt,
    provenance: {
      kind: "live",
      runId: state.runId,
      cliVersion: input.cliVersion ?? null,
      workflowId: state.input.workflowTemplateId,
      policyVersion: "source-policy-v1",
      promptVersion: "agent-synthesis-v1",
      model: null,
      fixture: false
    },
    decision: {
      title: state.input.jobTitle || state.input.workflowName || "Web research decision",
      summary: state.researchSummary?.executiveSummary || "Review the evidence and unresolved validation items before deciding."
    },
    claims,
    sources: sourceItems,
    contradictions,
    nextValidation: state.researchSummary?.recommendations?.[0] || "Review the strongest claim, its contrary evidence, and the smallest test that could disprove it.",
    limitations,
    integrity: {
      algorithm: RECEIPT_HASH_ALGORITHM,
      manifestPath: "integrity-manifest.json",
      note: "The manifest covers exported files; receipt structure and evidence references are validated separately."
    }
  };
}

function sha256(content: Buffer | string): string {
  return createHash(RECEIPT_HASH_ALGORITHM).update(content).digest("hex");
}

function fileSha256(filePath: string): string {
  return sha256(fs.readFileSync(filePath));
}

function trimText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function reportSection(report: string, heading: string, nextHeadings: string[]): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = nextHeadings
    .map((candidate) => candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const match = report.match(new RegExp(`##\\s+${escapedHeading}\\s*\\n([\\s\\S]*?)(?=##\\s+(?:${end})\\s*$|$)`, "im"));
  return match?.[1]?.trim() ?? "";
}

function sectionBullets(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.+)$/)?.[1] ?? "")
    .map(trimText)
    .filter(Boolean);
}

function sectionParagraph(report: string, heading: string, nextHeadings: string[]): string {
  const section = reportSection(report, heading, nextHeadings);
  return trimText(section.split(/\n\s*\n/)[0] ?? "");
}

function safeRelativePath(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`receipt artifact must stay inside package root: ${filePath}`);
  }
  return relative.split(path.sep).join("/");
}

function validateHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function integrityFiles(rootDir: string, paths: string[]): ReceiptIntegrityManifestFile[] {
  return [...new Set(paths)]
    .map((filePath) => path.resolve(filePath))
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    .map((filePath) => ({
      path: safeRelativePath(rootDir, filePath),
      sha256: fileSha256(filePath),
      bytes: fs.statSync(filePath).size
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function writeReceiptIntegrityManifest(input: {
  rootDir: string;
  files: string[];
  generatedAt?: string;
}): string {
  const rootDir = path.resolve(input.rootDir);
  const manifestPath = path.join(rootDir, "integrity-manifest.json");
  ensureDir(rootDir);
  const manifest: ReceiptIntegrityManifest = {
    schemaVersion: DECISION_RECEIPT_SCHEMA_VERSION,
    type: "receipt-integrity-manifest",
    algorithm: RECEIPT_HASH_ALGORITHM,
    receiptPath: "receipt.json",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    files: integrityFiles(rootDir, input.files.filter((filePath) => path.resolve(filePath) !== manifestPath))
  };
  writeJsonAtomic(manifestPath, manifest);
  return manifestPath;
}

function validateReceiptShape(receipt: unknown, rootDir: string, errors: string[]): receipt is DecisionReceipt {
  if (!receipt || typeof receipt !== "object") {
    errors.push("receipt.json is not an object");
    return false;
  }
  const candidate = receipt as Partial<DecisionReceipt>;
  if (candidate.schemaVersion !== DECISION_RECEIPT_SCHEMA_VERSION) {
    errors.push(`unsupported receipt schema version: ${String(candidate.schemaVersion)}`);
  }
  if (candidate.type !== "decision-receipt") {
    errors.push("receipt type must be decision-receipt");
  }
  if (!candidate.decision || typeof candidate.decision !== "object") {
    errors.push("receipt decision is missing");
  }
  if (!Array.isArray(candidate.claims)) {
    errors.push("receipt claims must be an array");
  }
  if (!Array.isArray(candidate.sources)) {
    errors.push("receipt sources must be an array");
  }
  if (!candidate.integrity || candidate.integrity.manifestPath !== "integrity-manifest.json") {
    errors.push("receipt must point to integrity-manifest.json");
  }

  const sources = Array.isArray(candidate.sources) ? candidate.sources : [];
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (!source || typeof source !== "object") {
      errors.push("receipt contains a malformed source");
      continue;
    }
    const typed = source as DecisionReceiptSource;
    if (!typed.id || sourceIds.has(typed.id)) {
      errors.push(`duplicate or empty source id: ${String(typed.id)}`);
    }
    sourceIds.add(typed.id);
    if (!validateHttpsUrl(String(typed.url))) {
      errors.push(`unsafe source URL for ${typed.id}: ${String(typed.url)}`);
    }
    if (typed.snapshotPath) {
      const snapshotPath = path.resolve(rootDir, typed.snapshotPath);
      if (!snapshotPath.startsWith(`${rootDir}${path.sep}`) || !fs.existsSync(snapshotPath)) {
        errors.push(`missing source snapshot for ${typed.id}: ${typed.snapshotPath}`);
      } else if (typed.snapshotSha256 && fileSha256(snapshotPath) !== typed.snapshotSha256) {
        errors.push(`source snapshot hash mismatch for ${typed.id}`);
      }
    }
  }

  const claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  const claimIds = new Set<string>();
  const evidenceIds = new Set<string>();
  for (const claim of claims) {
    if (!claim || typeof claim !== "object") {
      errors.push("receipt contains a malformed claim");
      continue;
    }
    const typed = claim as DecisionReceiptClaim;
    if (!typed.id || claimIds.has(typed.id)) {
      errors.push(`duplicate or empty claim id: ${String(typed.id)}`);
    }
    claimIds.add(typed.id);
    if (!["supported", "contradicted", "insufficient"].includes(typed.status)) {
      errors.push(`invalid claim status for ${typed.id}`);
    }
    if (!Array.isArray(typed.evidence) || typed.evidence.length === 0) {
      errors.push(`claim ${typed.id} has no evidence reference`);
      continue;
    }
    for (const evidence of typed.evidence) {
      if (!evidence || typeof evidence !== "object") {
        errors.push(`claim ${typed.id} contains malformed evidence`);
        continue;
      }
      const reference = evidence as DecisionReceiptEvidenceRef;
      if (!reference.id || evidenceIds.has(reference.id)) {
        errors.push(`duplicate or empty evidence id: ${String(reference.id)}`);
      }
      evidenceIds.add(reference.id);
      if (!sourceIds.has(reference.sourceId)) {
        errors.push(`claim ${typed.id} references unknown source ${reference.sourceId}`);
      }
      if (!trimText(String(reference.excerpt))) {
        errors.push(`claim ${typed.id} has an empty evidence excerpt`);
      }
      const source = sources.find((item) => item && typeof item === "object" && (item as DecisionReceiptSource).id === reference.sourceId) as DecisionReceiptSource | undefined;
      if (source?.snapshotPath) {
        const snapshotPath = path.resolve(rootDir, source.snapshotPath);
        if (fs.existsSync(snapshotPath) && !fs.readFileSync(snapshotPath, "utf8").includes(reference.excerpt)) {
          errors.push(`evidence excerpt ${reference.id} is absent from ${source.snapshotPath}`);
        }
      }
    }
  }

  return errors.length === 0;
}

export function verifyReceiptDirectory(inputDir: string): ReceiptVerificationResult {
  const rootDir = path.resolve(inputDir);
  const errors: string[] = [];
  const receiptPath = path.join(rootDir, "receipt.json");
  const manifestPath = path.join(rootDir, "integrity-manifest.json");
  let receipt: DecisionReceipt | null = null;
  let checkedFiles = 0;

  if (!fs.existsSync(receiptPath)) {
    errors.push("receipt.json is missing");
  } else {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      if (validateReceiptShape(parsed, rootDir, errors)) {
        receipt = parsed;
      }
    } catch (error) {
      errors.push(`could not parse receipt.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!fs.existsSync(manifestPath)) {
    errors.push("integrity-manifest.json is missing");
  } else {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Partial<ReceiptIntegrityManifest>;
      if (manifest.type !== "receipt-integrity-manifest" || manifest.schemaVersion !== DECISION_RECEIPT_SCHEMA_VERSION) {
        errors.push("integrity manifest has an unsupported shape");
      }
      if (!Array.isArray(manifest.files)) {
        errors.push("integrity manifest files must be an array");
      } else {
        for (const entry of manifest.files) {
          const relative = String(entry?.path ?? "");
          const candidatePath = path.resolve(rootDir, relative);
          checkedFiles += 1;
          if (!relative || !candidatePath.startsWith(`${rootDir}${path.sep}`)) {
            errors.push(`integrity manifest path escapes package root: ${relative}`);
            continue;
          }
          if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) {
            errors.push(`integrity manifest file is missing: ${relative}`);
            continue;
          }
          if (fileSha256(candidatePath) !== entry.sha256) {
            errors.push(`integrity hash mismatch: ${relative}`);
          }
          if (fs.statSync(candidatePath).size !== entry.bytes) {
            errors.push(`integrity byte count mismatch: ${relative}`);
          }
        }
      }
    } catch (error) {
      errors.push(`could not parse integrity-manifest.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { valid: errors.length === 0, rootDir, checkedFiles, errors, receipt };
}

export function buildFixtureDecisionReceipt(input: FixtureReceiptInput, paths: FixtureReceiptPaths): DecisionReceipt {
  const supportedClaims = sectionBullets(reportSection(input.report, "What the evidence supports", ["Product implication", "Evaluation rubric", "Required controls", "What could invalidate this", "Residual risk", "Next validation", "Rejection examples"]));
  const claims = (supportedClaims.length > 0 ? supportedClaims : [input.scenario]).map((text, index) => {
    const source = input.sources[index % input.sources.length];
    const sourceId = `source-${(index % input.sources.length) + 1}`;
    const evidenceId = `evidence-${index + 1}`;
    return {
      id: `claim-${index + 1}`,
      text,
      status: "supported" as const,
      evidence: [{
        id: evidenceId,
        sourceId,
        excerpt: text,
        relation: "supports" as const
      }]
    };
  });
  const contradictions = sectionBullets(reportSection(input.report, "What could invalidate this", ["Next validation", "Residual risk"])).map((note, index) => ({
    id: `limitation-${index + 1}`,
    topic: "invalidation",
    evidenceIds: [],
    note
  }));
  return {
    schemaVersion: DECISION_RECEIPT_SCHEMA_VERSION,
    type: "decision-receipt",
    generatedAt: input.generatedAt,
    provenance: {
      kind: "deterministic-demo",
      runId: null,
      cliVersion: null,
      workflowId: input.id,
      policyVersion: null,
      promptVersion: null,
      model: null,
      fixture: true
    },
    decision: {
      title: input.title,
      summary: sectionParagraph(input.report, "Decision", ["What the evidence supports", "Product implication", "Required controls", "Evaluation rubric", "What could invalidate this", "Residual risk", "Next validation", "Rejection examples"]) || input.scenario
    },
    claims,
    sources: input.sources.map((source, index) => {
      const snapshotPath = paths.snapshotPaths[index];
      return {
        id: `source-${index + 1}`,
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        role: source.role,
        collectedAt: source.accessedAt,
        captureType: "fixture-synthetic",
        snapshotPath: snapshotPath ? safeRelativePath(path.dirname(paths.receiptPath), snapshotPath) : null,
        snapshotSha256: snapshotPath && fs.existsSync(snapshotPath) ? fileSha256(snapshotPath) : null
      };
    }),
    contradictions,
    nextValidation: sectionParagraph(input.report, "Next validation", ["What could invalidate this", "Residual risk"]) || "Re-run the decision against current sources and review each cited claim.",
    limitations: [
      "This is a deterministic fixture; it is not fresh web research.",
      "Hashes prove artifact integrity, not the truth, completeness, authorization, or freshness of a source."
    ],
    integrity: {
      algorithm: RECEIPT_HASH_ALGORITHM,
      manifestPath: "integrity-manifest.json",
      note: "The manifest covers exported files; receipt structure and evidence references are validated separately."
    }
  };
}
