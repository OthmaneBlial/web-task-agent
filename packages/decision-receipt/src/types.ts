export const DECISION_RECEIPT_SCHEMA_VERSION = 1 as const;
export const DECISION_RECEIPT_SPEC_VERSION = "1.0.0" as const;
export const RECEIPT_HASH_ALGORITHM = "sha256" as const;

export type DecisionReceiptSpecVersion = `1.${number}.${number}`;
export type ReceiptProfile = "minimal" | "full";
export type ReceiptClaimStatus = "supported" | "contradicted" | "insufficient";
export type ReceiptProvenanceKind =
  | "live"
  | "deterministic-demo"
  | "imported"
  | "captured"
  | "inferred"
  | "operator-attested";

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

export interface DecisionReceiptSignature {
  algorithm: "ed25519";
  keyId: string;
  publicKeyPem: string;
  signatureBase64: string;
  signedBytes: "canonical-receipt-without-signature";
}

export interface DecisionReceipt {
  schemaVersion: typeof DECISION_RECEIPT_SCHEMA_VERSION;
  specVersion: DecisionReceiptSpecVersion;
  profile: ReceiptProfile;
  type: "decision-receipt";
  generatedAt: string;
  provenance: {
    kind: ReceiptProvenanceKind;
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
  signature?: DecisionReceiptSignature;
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
  specVersion: DecisionReceiptSpecVersion;
  type: "receipt-integrity-manifest";
  algorithm: typeof RECEIPT_HASH_ALGORITHM;
  receiptPath: "receipt.json";
  generatedAt: string;
  files: ReceiptIntegrityManifestFile[];
}

export interface ReceiptValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ReceiptValidationResult {
  valid: boolean;
  issues: ReceiptValidationIssue[];
  errors: string[];
  receipt: DecisionReceipt | null;
}

export type ReceiptBundleFile = string | Uint8Array | ArrayBuffer;
export type ReceiptBundle = Record<string, ReceiptBundleFile>;

export interface ReceiptBundleVerificationResult extends ReceiptValidationResult {
  checkedFiles: number;
  signatureVerified: boolean | null;
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
