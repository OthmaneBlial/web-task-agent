import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
  type KeyObject
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ensureDir, writeJsonAtomic } from "./cache";
import {
  requireDecisionReceiptAdapterResult,
  type AdapterOrigin,
  type DecisionReceiptAdapterResult
} from "./adapter-contract";
import { evaluateSourceUrlPolicy } from "./source-policy";
import type { AgentEvidenceBundle, AgentRunState } from "../types";
import {
  DECISION_RECEIPT_SPEC_VERSION,
  canonicalizeReceiptForSigning,
  compareDecisionReceipts as compareCoreDecisionReceipts,
  isSupportedDecisionReceiptSpecVersion,
  renderDecisionReceiptComparison as renderCoreDecisionReceiptComparison,
  validateDecisionReceipt
} from "../../packages/decision-receipt/dist";

export const DECISION_RECEIPT_SCHEMA_VERSION = 1;
export { DECISION_RECEIPT_SPEC_VERSION };
export const RECEIPT_HASH_ALGORITHM = "sha256" as const;

export type ReceiptClaimStatus = "supported" | "contradicted" | "insufficient";

export interface DecisionReceiptSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  role: string;
  collectedAt: string | null;
  captureType: "live" | "fixture-synthetic" | "metadata-only" | "imported-excerpt";
  snapshotPath: string | null;
  snapshotSha256: string | null;
  adapterOrigin?: AdapterOrigin;
}

export interface DecisionReceiptEvidenceRef {
  id: string;
  sourceId: string;
  excerpt: string;
  relation: "supports" | "contradicts" | "context";
  adapterOrigin?: AdapterOrigin;
}

export interface DecisionReceiptClaim {
  id: string;
  text: string;
  status: ReceiptClaimStatus;
  evidence: DecisionReceiptEvidenceRef[];
  limitation?: string;
  adapterOrigin?: AdapterOrigin;
}

export interface DecisionReceipt {
  schemaVersion: typeof DECISION_RECEIPT_SCHEMA_VERSION;
  specVersion: typeof DECISION_RECEIPT_SPEC_VERSION;
  profile: "minimal" | "full";
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
    adapterOrigin?: AdapterOrigin;
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
  signature?: DecisionReceiptSignature;
  integrity: {
    algorithm: typeof RECEIPT_HASH_ALGORITHM;
    manifestPath: "integrity-manifest.json";
    note: string;
  };
}

export interface DecisionReceiptSignature {
  algorithm: "ed25519";
  keyId: string;
  publicKeyPem: string;
  signatureBase64: string;
  signedBytes: "canonical-receipt-without-signature";
}

export interface ReceiptIntegrityManifestFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface ReceiptIntegrityManifest {
  schemaVersion: typeof DECISION_RECEIPT_SCHEMA_VERSION;
  specVersion: typeof DECISION_RECEIPT_SPEC_VERSION;
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
  changes: {
    sources: boolean;
    claims: boolean;
    policy: boolean;
    model: boolean;
    prompt: boolean;
    decision: boolean;
  };
  changedBecause: string[];
}

export function compareDecisionReceipts(
  earlier: DecisionReceipt,
  later: DecisionReceipt
): DecisionReceiptComparison {
  return compareCoreDecisionReceipts(earlier, later) as DecisionReceiptComparison;
}

export function renderDecisionReceiptComparison(
  comparison: DecisionReceiptComparison,
  format: "markdown" | "json" = "markdown"
): string {
  return renderCoreDecisionReceiptComparison(comparison, format);
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

export interface ExternalDecisionResult {
  title: string;
  summary: string;
  sources: Array<{
    id?: string;
    title: string;
    url: string;
    publisher?: string;
    role?: string;
    collectedAt?: string | null;
    excerpt?: string | null;
    adapterOrigin?: AdapterOrigin;
  }>;
  claims?: Array<{
    id?: string;
    text: string;
    status?: ReceiptClaimStatus;
    evidence?: Array<{
      id?: string;
      sourceId?: string;
      sourceIndex?: number;
      excerpt?: string;
      relation?: DecisionReceiptEvidenceRef["relation"];
      adapterOrigin?: AdapterOrigin;
    }>;
    limitation?: string;
    adapterOrigin?: AdapterOrigin;
  }>;
  contradictions?: DecisionReceipt["contradictions"];
  limitations?: string[];
  nextValidation?: string;
  generatedAt?: string;
  policyVersion?: string | null;
  model?: string | null;
  fixture?: boolean;
  decisionOrigin?: AdapterOrigin;
  adapter?: {
    id: string;
    version: string;
    engine: string;
    engineVersion: string;
    runId: string | null;
  };
}

export interface ImportedReceiptPaths {
  receiptPath: string;
  integrityManifestPath: string;
  snapshotPaths: string[];
}

function normalizeExternalResult(result: ExternalDecisionResult | DecisionReceiptAdapterResult): ExternalDecisionResult {
  if (!result || typeof result !== "object" || !("adapterContractVersion" in result)) return result as ExternalDecisionResult;
  const contract = requireDecisionReceiptAdapterResult(result);
  return {
    title: contract.decision.title,
    summary: contract.decision.summary,
    generatedAt: contract.producer.exportedAt,
    policyVersion: contract.policyVersion,
    model: contract.model,
    fixture: contract.producer.fixture,
    decisionOrigin: contract.decision.origin,
    adapter: {
      id: contract.producer.adapterId,
      version: contract.producer.adapterVersion,
      engine: contract.producer.engine,
      engineVersion: contract.producer.engineVersion,
      runId: contract.producer.runId
    },
    sources: contract.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      role: source.role,
      collectedAt: source.collectedAt,
      excerpt: source.excerpt,
      adapterOrigin: source.origin
    })),
    claims: contract.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      status: claim.status,
      limitation: claim.limitation,
      adapterOrigin: claim.origin,
      evidence: claim.evidence.map((evidence) => ({
        id: evidence.id,
        sourceId: evidence.sourceId,
        excerpt: evidence.excerpt,
        relation: evidence.relation,
        adapterOrigin: evidence.origin
      }))
    })),
    contradictions: contract.contradictions,
    limitations: [
      `Adapter ${contract.producer.adapterId}@${contract.producer.adapterVersion} imported ${contract.producer.engine}@${contract.producer.engineVersion}; engine run id: ${contract.producer.runId ?? "not provided"}.`,
      ...contract.limitations
    ],
    nextValidation: contract.decision.nextValidation
  };
}

function importSlug(value: string, fallback: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

/**
 * Convert a provider-neutral research result into the local receipt contract.
 * This is deliberately an ingestion boundary: it imports claims and evidence,
 * but never runs a browser, calls a hosted provider, or grants new capability.
 */
export function importExternalDecisionResult(input: {
  result: ExternalDecisionResult | DecisionReceiptAdapterResult;
  outputDir: string;
  force?: boolean;
}): ImportedReceiptPaths {
  const outputDir = path.resolve(input.outputDir);
  if (fs.existsSync(outputDir) && !input.force && fs.readdirSync(outputDir).length > 0) {
    throw new Error(`refusing to overwrite non-empty import directory: ${outputDir}; pass --force to replace it.`);
  }
  ensureDir(outputDir);
  const result = normalizeExternalResult(input.result);
  if (!result || typeof result.title !== "string" || !result.title.trim()) {
    throw new Error("external result title is required");
  }
  if (typeof result.summary !== "string" || !result.summary.trim()) {
    throw new Error("external result summary is required");
  }

  const sourceIds = new Set<string>();
  const snapshotPaths: string[] = [];
  const sources: DecisionReceiptSource[] = result.sources.map((source, index) => {
    if (!source || typeof source.url !== "string" || !source.url.trim()) {
      throw new Error(`external source ${index + 1} is missing a URL`);
    }
    const policy = evaluateSourceUrlPolicy(source.url);
    if (policy.action === "deny") {
      throw new Error(`external source ${index + 1} denied by source policy: ${policy.reason}`);
    }
    const baseId = importSlug(source.id || source.title, `source-${index + 1}`);
    let id = baseId;
    let suffix = 2;
    while (sourceIds.has(id)) id = `${baseId}-${suffix++}`;
    sourceIds.add(id);
    const excerpt = typeof source.excerpt === "string" ? source.excerpt.trim() : "";
    let snapshotPath: string | null = null;
    if (excerpt) {
      snapshotPath = path.join(outputDir, "evidence", "snapshots", `${String(index + 1).padStart(2, "0")}-${id}.md`);
      ensureDir(path.dirname(snapshotPath));
      fs.writeFileSync(snapshotPath, `# ${source.title}\n\n${excerpt}\n`, "utf8");
      snapshotPaths.push(snapshotPath);
    }
    return {
      id,
      title: source.title.trim() || id,
      url: source.url.trim(),
      publisher: source.publisher?.trim() || new URL(source.url).hostname,
      role: source.role?.trim() || "external research result",
      collectedAt: source.collectedAt ?? null,
      captureType: excerpt ? "imported-excerpt" : "metadata-only",
      snapshotPath: snapshotPath ? safeRelativePath(outputDir, snapshotPath) : null,
      snapshotSha256: snapshotPath ? fileSha256(snapshotPath) : null,
      adapterOrigin: source.adapterOrigin
    };
  });

  const claims: DecisionReceiptClaim[] = (result.claims ?? []).map((claim, claimIndex) => {
    const evidence = (claim.evidence ?? []).map((reference, evidenceIndex) => {
      const sourceId = reference.sourceId || (reference.sourceIndex !== undefined ? sources[reference.sourceIndex]?.id : undefined);
      if (!sourceId || !sourceIds.has(sourceId)) {
        throw new Error(`external claim ${claimIndex + 1} references an unknown source`);
      }
      const source = sources.find((item) => item.id === sourceId)!;
      const snapshotText = source.snapshotPath ? fs.readFileSync(path.join(outputDir, source.snapshotPath), "utf8") : "";
      const excerpt = (reference.excerpt || snapshotText.split("\n\n").slice(1).join("\n\n").trim() || claim.text).trim();
      return {
        id: reference.id || `evidence-${claimIndex + 1}-${evidenceIndex + 1}`,
        sourceId,
        excerpt,
        relation: reference.relation ?? "supports",
        adapterOrigin: reference.adapterOrigin
      } satisfies DecisionReceiptEvidenceRef;
    });
    const fallbackSource = sources[0];
    const fallbackExcerpt = fallbackSource?.snapshotPath
      ? fs.readFileSync(path.join(outputDir, fallbackSource.snapshotPath), "utf8").split("\n\n").slice(1).join("\n\n").trim()
      : claim.text.trim();
    const normalizedEvidence = evidence.length > 0 || !fallbackSource
      ? evidence
      : [{ id: `evidence-${claimIndex + 1}-context`, sourceId: fallbackSource.id, excerpt: fallbackExcerpt || claim.text.trim(), relation: "context" as const }];
    return {
      id: importSlug(claim.id || `claim-${claimIndex + 1}`, `claim-${claimIndex + 1}`),
      text: claim.text.trim(),
      status: claim.status ?? (evidence.length > 0 ? "supported" : "insufficient"),
      evidence: normalizedEvidence,
      limitation: claim.limitation || (evidence.length > 0 ? undefined : "The external result did not attach a direct evidence reference."),
      adapterOrigin: claim.adapterOrigin
    };
  });

  const receipt: DecisionReceipt = {
    schemaVersion: DECISION_RECEIPT_SCHEMA_VERSION,
    specVersion: DECISION_RECEIPT_SPEC_VERSION,
    profile: "minimal",
    type: "decision-receipt",
    generatedAt: result.generatedAt || new Date().toISOString(),
    provenance: {
      kind: "imported",
      runId: null,
      cliVersion: null,
      workflowId: null,
      policyVersion: result.policyVersion ?? "source-policy-v1",
      promptVersion: null,
      model: result.model ?? null,
      fixture: result.fixture ?? false
    },
    decision: { title: result.title.trim(), summary: result.summary.trim(), adapterOrigin: result.decisionOrigin },
    claims,
    sources,
    contradictions: result.contradictions ?? [],
    nextValidation: result.nextValidation?.trim() || "Review the imported claims and run the smallest test that could disprove the decision.",
    limitations: [
      "Imported evidence preserves the provider result but does not prove that its sources are true, complete, authorized, or fresh.",
      ...(result.limitations ?? []).map((item) => item.trim()).filter(Boolean)
    ],
    integrity: {
      algorithm: RECEIPT_HASH_ALGORITHM,
      manifestPath: "integrity-manifest.json",
      note: "The manifest covers the imported receipt and snapshots; provider-specific provenance remains outside this contract."
    }
  };
  const receiptPath = path.join(outputDir, "receipt.json");
  writeJsonAtomic(receiptPath, receipt);
  const integrityManifestPath = writeReceiptIntegrityManifest({
    rootDir: outputDir,
    files: [receiptPath, ...snapshotPaths],
    generatedAt: receipt.generatedAt
  });
  return { receiptPath, integrityManifestPath, snapshotPaths };
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
    specVersion: DECISION_RECEIPT_SPEC_VERSION,
    profile: "full",
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

function receiptSigningPayload(receipt: DecisionReceipt): Buffer {
  return Buffer.from(canonicalizeReceiptForSigning(receipt), "utf8");
}

function privateKeyObject(privateKey: string | KeyObject): KeyObject {
  return typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
}

export function signReceiptDirectory(input: {
  directory: string;
  privateKey: string | KeyObject;
  keyId: string;
}): string {
  const rootDir = path.resolve(input.directory);
  const receiptPath = path.join(rootDir, "receipt.json");
  if (!fs.existsSync(receiptPath)) throw new Error(`receipt.json is missing: ${receiptPath}`);
  if (!input.keyId.trim()) throw new Error("signature keyId is required");
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as DecisionReceipt;
  if (receipt.type !== "decision-receipt") throw new Error("cannot sign a non-decision receipt");
  const privateKey = privateKeyObject(input.privateKey);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("receipt signing requires an Ed25519 private key");
  const signatureBase64 = signBytes(null, receiptSigningPayload(receipt), privateKey).toString("base64");
  const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  const signedReceipt: DecisionReceipt = {
    ...receipt,
    signature: {
      algorithm: "ed25519",
      keyId: input.keyId.trim(),
      publicKeyPem,
      signatureBase64,
      signedBytes: "canonical-receipt-without-signature"
    }
  };
  writeJsonAtomic(receiptPath, signedReceipt);
  const manifestPath = path.join(rootDir, "integrity-manifest.json");
  const existingManifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Partial<ReceiptIntegrityManifest>
    : null;
  const files = (existingManifest?.files ?? []).map((entry) => path.join(rootDir, String(entry.path)));
  writeReceiptIntegrityManifest({ rootDir, files: [receiptPath, ...files], generatedAt: existingManifest?.generatedAt || receipt.generatedAt });
  return receiptPath;
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
    specVersion: DECISION_RECEIPT_SPEC_VERSION,
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
  const coreValidation = validateDecisionReceipt(receipt);
  for (const issue of coreValidation.issues) {
    errors.push(`receipt core ${issue.code} at ${issue.path}: ${issue.message}`);
  }
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
  if (candidate.signature) {
    const signature = candidate.signature as Partial<DecisionReceiptSignature>;
    if (signature.algorithm !== "ed25519" || signature.signedBytes !== "canonical-receipt-without-signature") {
      errors.push("receipt signature has an unsupported algorithm or signed-bytes marker");
    }
    if (!signature.keyId || !signature.publicKeyPem || !signature.signatureBase64) {
      errors.push("receipt signature is incomplete");
    }
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
    } else {
      const policy = evaluateSourceUrlPolicy(String(typed.url));
      if (policy.action === "deny") {
        errors.push(`unsafe source URL for ${typed.id}: ${policy.reason}`);
      }
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

function validateReceiptSignature(receipt: DecisionReceipt, errors: string[]): void {
  if (!receipt.signature) return;
  try {
    const publicKey = createPublicKey(receipt.signature.publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519") {
      errors.push("receipt signature public key is not Ed25519");
      return;
    }
    const valid = verifyBytes(
      null,
      receiptSigningPayload(receipt),
      publicKey,
      Buffer.from(receipt.signature.signatureBase64, "base64")
    );
    if (!valid) errors.push(`receipt signature verification failed for key ${receipt.signature.keyId}`);
  } catch (error) {
    errors.push(`could not verify receipt signature: ${error instanceof Error ? error.message : String(error)}`);
  }
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
        validateReceiptSignature(receipt, errors);
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
      if (
        manifest.type !== "receipt-integrity-manifest" ||
        manifest.schemaVersion !== DECISION_RECEIPT_SCHEMA_VERSION ||
        !isSupportedDecisionReceiptSpecVersion(manifest.specVersion)
      ) {
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
    specVersion: DECISION_RECEIPT_SPEC_VERSION,
    profile: "full",
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
