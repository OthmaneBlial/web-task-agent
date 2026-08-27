import { evaluateSourceUrlPolicy } from "./source-policy";

export const DECISION_RECEIPT_ADAPTER_CONTRACT_VERSION = "1.0.0" as const;

export type AdapterOriginKind = "imported" | "captured" | "inferred" | "operator-attested";

export interface AdapterOrigin {
  kind: AdapterOriginKind;
  note: string | null;
}

export interface DecisionReceiptAdapterResult {
  adapterContractVersion: typeof DECISION_RECEIPT_ADAPTER_CONTRACT_VERSION;
  producer: {
    adapterId: string;
    adapterVersion: string;
    engine: string;
    engineVersion: string;
    runId: string | null;
    exportedAt: string;
    fixture: boolean;
  };
  decision: {
    title: string;
    summary: string;
    nextValidation: string;
    origin: AdapterOrigin;
  };
  sources: Array<{
    id: string;
    title: string;
    url: string;
    publisher: string;
    role: string;
    collectedAt: string | null;
    excerpt: string;
    origin: AdapterOrigin;
  }>;
  claims: Array<{
    id: string;
    text: string;
    status: "supported" | "contradicted" | "insufficient";
    evidence: Array<{
      id: string;
      sourceId: string;
      excerpt: string;
      relation: "supports" | "contradicts" | "context";
      origin: AdapterOrigin;
    }>;
    limitation?: string;
    origin: AdapterOrigin;
  }>;
  contradictions: Array<{
    id: string;
    topic: string;
    evidenceIds: string[];
    note: string;
  }>;
  limitations: string[];
  policyVersion: string | null;
  model: string | null;
}

export interface AdapterContractValidation {
  valid: boolean;
  errors: string[];
  result: DecisionReceiptAdapterResult | null;
}

const origins = new Set<AdapterOriginKind>(["imported", "captured", "inferred", "operator-attested"]);
const statuses = new Set(["supported", "contradicted", "insufficient"]);
const relations = new Set(["supports", "contradicts", "context"]);
const forbiddenKeys = /^(authorization|cookie|cookies|credential|credentials|headers|prompt|prompts|script|scripts|session|sessions|systemprompt|token|tokens|toolcalls)$/i;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function dateTime(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function inspectForbiddenKeys(value: unknown, currentPath: string, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectForbiddenKeys(item, `${currentPath}/${index}`, errors));
    return;
  }
  const object = objectValue(value);
  if (!object) return;
  for (const [key, child] of Object.entries(object)) {
    if (forbiddenKeys.test(key.replace(/[-_]/g, ""))) errors.push(`${currentPath}/${key}: forbidden provider-private or executable field`);
    inspectForbiddenKeys(child, `${currentPath}/${key}`, errors);
  }
}

function requireAllowedKeys(object: Record<string, unknown>, allowed: string[], currentPath: string, errors: string[]): void {
  const permitted = new Set(allowed);
  for (const key of Object.keys(object)) if (!permitted.has(key)) errors.push(`${currentPath}/${key}: unknown field`);
}

function validateOrigin(value: unknown, currentPath: string, errors: string[]): value is AdapterOrigin {
  const origin = objectValue(value);
  if (!origin) {
    errors.push(`${currentPath}: origin must be an object`);
    return false;
  }
  requireAllowedKeys(origin, ["kind", "note"], currentPath, errors);
  if (!origins.has(origin.kind as AdapterOriginKind)) errors.push(`${currentPath}/kind: unsupported origin`);
  if (origin.note !== null && !nonEmpty(origin.note)) errors.push(`${currentPath}/note: use a non-empty string or null`);
  if ((origin.kind === "inferred" || origin.kind === "operator-attested") && !nonEmpty(origin.note)) {
    errors.push(`${currentPath}/note: inferred and operator-attested values require an explicit note`);
  }
  return errors.length === 0;
}

export function validateDecisionReceiptAdapterResult(value: unknown): AdapterContractValidation {
  const errors: string[] = [];
  inspectForbiddenKeys(value, "", errors);
  const root = objectValue(value);
  if (!root) return { valid: false, errors: [...errors, "/: adapter result must be an object"], result: null };
  requireAllowedKeys(root, ["adapterContractVersion", "producer", "decision", "sources", "claims", "contradictions", "limitations", "policyVersion", "model"], "", errors);
  if (root.adapterContractVersion !== DECISION_RECEIPT_ADAPTER_CONTRACT_VERSION) errors.push("/adapterContractVersion: expected 1.0.0");

  const producer = objectValue(root.producer);
  if (!producer) errors.push("/producer: required object");
  else {
    requireAllowedKeys(producer, ["adapterId", "adapterVersion", "engine", "engineVersion", "runId", "exportedAt", "fixture"], "/producer", errors);
    for (const key of ["adapterId", "adapterVersion", "engine", "engineVersion"] as const) if (!nonEmpty(producer[key])) errors.push(`/producer/${key}: required string`);
    if (producer.runId !== null && !nonEmpty(producer.runId)) errors.push("/producer/runId: use a non-empty string or null");
    if (!dateTime(producer.exportedAt)) errors.push("/producer/exportedAt: required ISO date-time");
    if (typeof producer.fixture !== "boolean") errors.push("/producer/fixture: required boolean");
  }

  const decision = objectValue(root.decision);
  if (!decision) errors.push("/decision: required object");
  else {
    requireAllowedKeys(decision, ["title", "summary", "nextValidation", "origin"], "/decision", errors);
    for (const key of ["title", "summary", "nextValidation"] as const) if (!nonEmpty(decision[key])) errors.push(`/decision/${key}: required string`);
    validateOrigin(decision.origin, "/decision/origin", errors);
  }

  const sourceIds = new Set<string>();
  if (!Array.isArray(root.sources) || root.sources.length === 0 || root.sources.length > 100) errors.push("/sources: require 1 to 100 sources");
  else root.sources.forEach((valueItem, index) => {
    const currentPath = `/sources/${index}`;
    const source = objectValue(valueItem);
    if (!source) {
      errors.push(`${currentPath}: source must be an object`);
      return;
    }
    requireAllowedKeys(source, ["id", "title", "url", "publisher", "role", "collectedAt", "excerpt", "origin"], currentPath, errors);
    for (const key of ["id", "title", "url", "publisher", "role", "excerpt"] as const) if (!nonEmpty(source[key])) errors.push(`${currentPath}/${key}: required string`);
    if (nonEmpty(source.id)) {
      if (sourceIds.has(source.id)) errors.push(`${currentPath}/id: duplicate source id`);
      sourceIds.add(source.id);
    }
    if (nonEmpty(source.url)) {
      const policy = evaluateSourceUrlPolicy(source.url);
      if (policy.action === "deny") errors.push(`${currentPath}/url: ${policy.reason}`);
    }
    if (source.collectedAt !== null && !dateTime(source.collectedAt)) errors.push(`${currentPath}/collectedAt: use an ISO date-time or null`);
    validateOrigin(source.origin, `${currentPath}/origin`, errors);
  });

  const evidenceIds = new Set<string>();
  if (!Array.isArray(root.claims) || root.claims.length === 0 || root.claims.length > 250) errors.push("/claims: require 1 to 250 claims");
  else root.claims.forEach((valueItem, claimIndex) => {
    const currentPath = `/claims/${claimIndex}`;
    const claim = objectValue(valueItem);
    if (!claim) {
      errors.push(`${currentPath}: claim must be an object`);
      return;
    }
    requireAllowedKeys(claim, ["id", "text", "status", "evidence", "limitation", "origin"], currentPath, errors);
    if (!nonEmpty(claim.id)) errors.push(`${currentPath}/id: required string`);
    if (!nonEmpty(claim.text)) errors.push(`${currentPath}/text: required string`);
    if (!statuses.has(String(claim.status))) errors.push(`${currentPath}/status: unsupported status`);
    if (claim.status === "insufficient" && !nonEmpty(claim.limitation)) errors.push(`${currentPath}/limitation: insufficient claims require a limitation`);
    if (claim.limitation !== undefined && !nonEmpty(claim.limitation)) errors.push(`${currentPath}/limitation: use a non-empty string when present`);
    validateOrigin(claim.origin, `${currentPath}/origin`, errors);
    if (!Array.isArray(claim.evidence) || claim.evidence.length === 0 || claim.evidence.length > 50) {
      errors.push(`${currentPath}/evidence: require 1 to 50 evidence references`);
      return;
    }
    claim.evidence.forEach((evidenceValue, evidenceIndex) => {
      const evidencePath = `${currentPath}/evidence/${evidenceIndex}`;
      const evidence = objectValue(evidenceValue);
      if (!evidence) {
        errors.push(`${evidencePath}: evidence must be an object`);
        return;
      }
      requireAllowedKeys(evidence, ["id", "sourceId", "excerpt", "relation", "origin"], evidencePath, errors);
      for (const key of ["id", "sourceId", "excerpt"] as const) if (!nonEmpty(evidence[key])) errors.push(`${evidencePath}/${key}: required string`);
      if (nonEmpty(evidence.id)) {
        if (evidenceIds.has(evidence.id)) errors.push(`${evidencePath}/id: duplicate evidence id`);
        evidenceIds.add(evidence.id);
      }
      if (nonEmpty(evidence.sourceId) && !sourceIds.has(evidence.sourceId)) errors.push(`${evidencePath}/sourceId: unknown source`);
      if (!relations.has(String(evidence.relation))) errors.push(`${evidencePath}/relation: unsupported relation`);
      validateOrigin(evidence.origin, `${evidencePath}/origin`, errors);
    });
  });

  if (!Array.isArray(root.contradictions)) errors.push("/contradictions: required array");
  else root.contradictions.forEach((valueItem, index) => {
    const currentPath = `/contradictions/${index}`;
    const contradiction = objectValue(valueItem);
    if (!contradiction) {
      errors.push(`${currentPath}: contradiction must be an object`);
      return;
    }
    requireAllowedKeys(contradiction, ["id", "topic", "evidenceIds", "note"], currentPath, errors);
    for (const key of ["id", "topic", "note"] as const) if (!nonEmpty(contradiction[key])) errors.push(`${currentPath}/${key}: required string`);
    if (!Array.isArray(contradiction.evidenceIds) || contradiction.evidenceIds.some((id) => !nonEmpty(id) || !evidenceIds.has(id))) {
      errors.push(`${currentPath}/evidenceIds: must reference known evidence ids`);
    }
  });

  if (!Array.isArray(root.limitations) || root.limitations.length === 0 || root.limitations.some((item) => !nonEmpty(item))) {
    errors.push("/limitations: require at least one non-empty limitation");
  }
  if (root.policyVersion !== null && !nonEmpty(root.policyVersion)) errors.push("/policyVersion: use a non-empty string or null");
  if (root.model !== null && !nonEmpty(root.model)) errors.push("/model: use a non-empty string or null");

  return { valid: errors.length === 0, errors, result: errors.length === 0 ? value as DecisionReceiptAdapterResult : null };
}

export function requireDecisionReceiptAdapterResult(value: unknown): DecisionReceiptAdapterResult {
  const validation = validateDecisionReceiptAdapterResult(value);
  if (!validation.valid || !validation.result) throw new Error(`adapter contract validation failed: ${validation.errors.join("; ")}`);
  return validation.result;
}
