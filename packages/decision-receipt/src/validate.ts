import {
  DECISION_RECEIPT_SCHEMA_VERSION,
  DECISION_RECEIPT_SPEC_VERSION,
  RECEIPT_HASH_ALGORITHM,
  type DecisionReceipt,
  type DecisionReceiptClaim,
  type DecisionReceiptEvidenceRef,
  type DecisionReceiptSource,
  type ReceiptValidationIssue,
  type ReceiptValidationResult
} from "./types";

const CLAIM_STATUSES = new Set(["supported", "contradicted", "insufficient"]);
const EVIDENCE_RELATIONS = new Set(["supports", "contradicts", "context"]);
const PROVENANCE_KINDS = new Set([
  "live",
  "deterministic-demo",
  "imported",
  "captured",
  "inferred",
  "operator-attested"
]);
const CAPTURE_TYPES = new Set(["live", "fixture-synthetic", "metadata-only", "imported-excerpt"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): boolean {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

export function isSafeRelativeReceiptPath(value: unknown): value is string {
  if (!nonEmpty(value) || value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
  const parts = value.split("/");
  return !parts.some((part) => !part || part === "." || part === "..");
}

export function isSafePublicSourceUrl(value: unknown): value is string {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isSupportedDecisionReceiptSpecVersion(value: unknown): value is `1.${number}.${number}` {
  return typeof value === "string" && /^1\.\d+\.\d+$/.test(value);
}

function issue(issues: ReceiptValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function validateSource(
  value: unknown,
  index: number,
  sourceIds: Set<string>,
  issues: ReceiptValidationIssue[]
): value is DecisionReceiptSource {
  const base = `/sources/${index}`;
  if (!isRecord(value)) {
    issue(issues, base, "source_malformed", "Source must be an object.");
    return false;
  }
  if (!nonEmpty(value.id)) issue(issues, `${base}/id`, "source_id_missing", "Source id is required.");
  else if (sourceIds.has(value.id)) issue(issues, `${base}/id`, "source_id_duplicate", `Duplicate source id: ${value.id}.`);
  else sourceIds.add(value.id);
  for (const key of ["title", "publisher", "role"] as const) {
    if (!nonEmpty(value[key])) issue(issues, `${base}/${key}`, "source_field_missing", `${key} is required.`);
  }
  if (!isSafePublicSourceUrl(value.url)) issue(issues, `${base}/url`, "source_url_unsafe", "Source URL must be public HTTP(S) without credentials.");
  if (value.collectedAt !== null && !isIsoDate(value.collectedAt)) {
    issue(issues, `${base}/collectedAt`, "source_date_invalid", "collectedAt must be an ISO date-time or null.");
  }
  if (!CAPTURE_TYPES.has(String(value.captureType))) {
    issue(issues, `${base}/captureType`, "source_capture_type_invalid", "Unsupported captureType.");
  }
  if (value.snapshotPath !== null && !isSafeRelativeReceiptPath(value.snapshotPath)) {
    issue(issues, `${base}/snapshotPath`, "source_snapshot_path_unsafe", "Snapshot path must stay inside the receipt bundle.");
  }
  if (value.snapshotSha256 !== null && !/^[a-f0-9]{64}$/.test(String(value.snapshotSha256))) {
    issue(issues, `${base}/snapshotSha256`, "source_snapshot_hash_invalid", "Snapshot hash must be 64 lowercase hexadecimal characters.");
  }
  if ((value.snapshotPath === null) !== (value.snapshotSha256 === null)) {
    issue(issues, base, "source_snapshot_pair_incomplete", "Snapshot path and hash must both be present or both be null.");
  }
  return true;
}

function validateEvidence(
  value: unknown,
  claimIndex: number,
  evidenceIndex: number,
  sourceIds: Set<string>,
  evidenceIds: Set<string>,
  issues: ReceiptValidationIssue[]
): value is DecisionReceiptEvidenceRef {
  const base = `/claims/${claimIndex}/evidence/${evidenceIndex}`;
  if (!isRecord(value)) {
    issue(issues, base, "evidence_malformed", "Evidence reference must be an object.");
    return false;
  }
  if (!nonEmpty(value.id)) issue(issues, `${base}/id`, "evidence_id_missing", "Evidence id is required.");
  else if (evidenceIds.has(value.id)) issue(issues, `${base}/id`, "evidence_id_duplicate", `Duplicate evidence id: ${value.id}.`);
  else evidenceIds.add(value.id);
  if (!nonEmpty(value.sourceId) || !sourceIds.has(value.sourceId)) {
    issue(issues, `${base}/sourceId`, "evidence_source_unknown", `Unknown source id: ${String(value.sourceId)}.`);
  }
  if (!nonEmpty(value.excerpt)) issue(issues, `${base}/excerpt`, "evidence_excerpt_missing", "Evidence excerpt is required.");
  if (!EVIDENCE_RELATIONS.has(String(value.relation))) {
    issue(issues, `${base}/relation`, "evidence_relation_invalid", "Unsupported evidence relation.");
  }
  return true;
}

function validateClaim(
  value: unknown,
  index: number,
  sourceIds: Set<string>,
  claimIds: Set<string>,
  evidenceIds: Set<string>,
  issues: ReceiptValidationIssue[]
): value is DecisionReceiptClaim {
  const base = `/claims/${index}`;
  if (!isRecord(value)) {
    issue(issues, base, "claim_malformed", "Claim must be an object.");
    return false;
  }
  if (!nonEmpty(value.id)) issue(issues, `${base}/id`, "claim_id_missing", "Claim id is required.");
  else if (claimIds.has(value.id)) issue(issues, `${base}/id`, "claim_id_duplicate", `Duplicate claim id: ${value.id}.`);
  else claimIds.add(value.id);
  if (!nonEmpty(value.text)) issue(issues, `${base}/text`, "claim_text_missing", "Claim text is required.");
  if (!CLAIM_STATUSES.has(String(value.status))) issue(issues, `${base}/status`, "claim_status_invalid", "Unsupported claim status.");
  const evidence = Array.isArray(value.evidence) ? value.evidence : [];
  if (evidence.length === 0) issue(issues, `${base}/evidence`, "claim_evidence_missing", "At least one evidence reference is required.");
  evidence.forEach((item, evidenceIndex) => validateEvidence(item, index, evidenceIndex, sourceIds, evidenceIds, issues));
  if (value.status === "contradicted" && !evidence.some((item) => isRecord(item) && item.relation === "contradicts")) {
    issue(issues, `${base}/evidence`, "claim_contradiction_missing", "A contradicted claim needs contrary evidence.");
  }
  if (value.status === "insufficient" && !nonEmpty(value.limitation)) {
    issue(issues, `${base}/limitation`, "claim_limitation_missing", "An insufficient claim needs an explicit limitation.");
  }
  return true;
}

export function validateDecisionReceipt(value: unknown): ReceiptValidationResult {
  const issues: ReceiptValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "/", "receipt_not_object", "Decision Receipt must be a JSON object.");
    return { valid: false, issues, errors: issues.map((item) => item.message), receipt: null };
  }
  if (value.schemaVersion !== DECISION_RECEIPT_SCHEMA_VERSION) {
    issue(issues, "/schemaVersion", "schema_version_unsupported", `Expected schema version ${DECISION_RECEIPT_SCHEMA_VERSION}.`);
  }
  if (!isSupportedDecisionReceiptSpecVersion(value.specVersion)) {
    issue(issues, "/specVersion", "spec_version_unsupported", `Expected a compatible 1.x spec version; this SDK writes ${DECISION_RECEIPT_SPEC_VERSION}.`);
  }
  if (value.profile !== "minimal" && value.profile !== "full") {
    issue(issues, "/profile", "profile_unsupported", "Profile must be minimal or full.");
  }
  if (value.type !== "decision-receipt") issue(issues, "/type", "receipt_type_invalid", "type must be decision-receipt.");
  if (!isIsoDate(value.generatedAt)) issue(issues, "/generatedAt", "generated_at_invalid", "generatedAt must be an ISO date-time.");

  if (!isRecord(value.provenance)) issue(issues, "/provenance", "provenance_missing", "Provenance is required.");
  else {
    if (!PROVENANCE_KINDS.has(String(value.provenance.kind))) issue(issues, "/provenance/kind", "provenance_kind_invalid", "Unsupported provenance kind.");
    if (typeof value.provenance.fixture !== "boolean") issue(issues, "/provenance/fixture", "provenance_fixture_invalid", "fixture must be boolean.");
    for (const key of ["runId", "cliVersion", "workflowId", "policyVersion", "promptVersion", "model"] as const) {
      if (value.provenance[key] !== null && typeof value.provenance[key] !== "string") {
        issue(issues, `/provenance/${key}`, "provenance_field_invalid", `${key} must be a string or null.`);
      }
    }
  }

  if (!isRecord(value.decision)) issue(issues, "/decision", "decision_missing", "Decision is required.");
  else {
    if (!nonEmpty(value.decision.title)) issue(issues, "/decision/title", "decision_title_missing", "Decision title is required.");
    if (!nonEmpty(value.decision.summary)) issue(issues, "/decision/summary", "decision_summary_missing", "Decision summary is required.");
  }

  const sourceIds = new Set<string>();
  const sources = Array.isArray(value.sources) ? value.sources : [];
  if (!Array.isArray(value.sources)) issue(issues, "/sources", "sources_not_array", "sources must be an array.");
  sources.forEach((source, index) => validateSource(source, index, sourceIds, issues));

  const claims = Array.isArray(value.claims) ? value.claims : [];
  if (!Array.isArray(value.claims)) issue(issues, "/claims", "claims_not_array", "claims must be an array.");
  const claimIds = new Set<string>();
  const evidenceIds = new Set<string>();
  claims.forEach((claim, index) => validateClaim(claim, index, sourceIds, claimIds, evidenceIds, issues));

  if (!Array.isArray(value.contradictions)) issue(issues, "/contradictions", "contradictions_not_array", "contradictions must be an array.");
  else {
    const contradictionIds = new Set<string>();
    value.contradictions.forEach((contradiction, index) => {
      const base = `/contradictions/${index}`;
      if (!isRecord(contradiction)) {
        issue(issues, base, "contradiction_malformed", "Contradiction must be an object.");
        return;
      }
      if (!nonEmpty(contradiction.id)) issue(issues, `${base}/id`, "contradiction_id_missing", "Contradiction id is required.");
      else if (contradictionIds.has(contradiction.id)) issue(issues, `${base}/id`, "contradiction_id_duplicate", `Duplicate contradiction id: ${contradiction.id}.`);
      else contradictionIds.add(contradiction.id);
      if (!nonEmpty(contradiction.topic)) issue(issues, `${base}/topic`, "contradiction_topic_missing", "Contradiction topic is required.");
      if (!nonEmpty(contradiction.note)) issue(issues, `${base}/note`, "contradiction_note_missing", "Contradiction note is required.");
      if (!Array.isArray(contradiction.evidenceIds) || contradiction.evidenceIds.some((id) => !nonEmpty(id) || !evidenceIds.has(id))) {
        issue(issues, `${base}/evidenceIds`, "contradiction_evidence_invalid", "Contradiction evidenceIds must reference known evidence ids.");
      }
    });
  }
  if (!nonEmpty(value.nextValidation)) issue(issues, "/nextValidation", "next_validation_missing", "nextValidation is required.");
  if (!Array.isArray(value.limitations) || value.limitations.some((item) => !nonEmpty(item))) {
    issue(issues, "/limitations", "limitations_invalid", "limitations must be an array of non-empty strings.");
  }
  if (!isRecord(value.integrity) || value.integrity.algorithm !== RECEIPT_HASH_ALGORITHM || value.integrity.manifestPath !== "integrity-manifest.json" || !nonEmpty(value.integrity.note)) {
    issue(issues, "/integrity", "integrity_contract_invalid", "Receipt must point to a SHA-256 integrity-manifest.json.");
  }
  if (value.signature !== undefined) {
    if (!isRecord(value.signature)) issue(issues, "/signature", "signature_malformed", "Signature must be an object.");
    else {
      if (value.signature.algorithm !== "ed25519" || value.signature.signedBytes !== "canonical-receipt-without-signature") {
        issue(issues, "/signature", "signature_contract_invalid", "Signature must use Ed25519 over canonical receipt bytes.");
      }
      for (const key of ["keyId", "publicKeyPem", "signatureBase64"] as const) {
        if (!nonEmpty(value.signature[key])) issue(issues, `/signature/${key}`, "signature_field_missing", `${key} is required.`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    errors: issues.map((item) => `${item.path}: ${item.message}`),
    receipt: issues.length === 0 ? value as unknown as DecisionReceipt : null
  };
}
