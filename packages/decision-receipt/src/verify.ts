import { canonicalizeReceiptForSigning } from "./canonical";
import {
  DECISION_RECEIPT_SCHEMA_VERSION,
  DECISION_RECEIPT_SPEC_VERSION,
  type DecisionReceipt,
  type ReceiptBundle,
  type ReceiptBundleFile,
  type ReceiptBundleVerificationResult,
  type ReceiptIntegrityManifest,
  type ReceiptValidationIssue
} from "./types";
import { isSafeRelativeReceiptPath, isSupportedDecisionReceiptSpecVersion, validateDecisionReceipt } from "./validate";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(value: ReceiptBundleFile): Uint8Array {
  if (typeof value === "string") return encoder.encode(value);
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

function exactArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function text(value: ReceiptBundleFile): string {
  return typeof value === "string" ? value : decoder.decode(bytes(value));
}

function normalizedBundle(bundle: ReceiptBundle): ReceiptBundle {
  return Object.fromEntries(Object.entries(bundle).map(([name, value]) => [name.replace(/^\.\//, ""), value]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(issues: ReceiptValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

export async function sha256Hex(value: ReceiptBundleFile): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", exactArrayBuffer(bytes(value)));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

function pemBytes(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, "");
  if (!base64) throw new Error("public key PEM is empty");
  if (typeof globalThis.atob === "function") {
    return Uint8Array.from(globalThis.atob(base64), (character) => character.charCodeAt(0));
  }
  throw new Error("base64 decoder is unavailable");
}

function base64Bytes(value: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    return Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
  }
  throw new Error("base64 decoder is unavailable");
}

async function verifySignature(receipt: DecisionReceipt): Promise<boolean | null> {
  if (!receipt.signature) return null;
  const key = await globalThis.crypto.subtle.importKey(
    "spki",
    exactArrayBuffer(pemBytes(receipt.signature.publicKeyPem)),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  return globalThis.crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    exactArrayBuffer(base64Bytes(receipt.signature.signatureBase64)),
    exactArrayBuffer(encoder.encode(canonicalizeReceiptForSigning(receipt)))
  );
}

export async function verifyReceiptBundle(input: ReceiptBundle): Promise<ReceiptBundleVerificationResult> {
  const bundle = normalizedBundle(input);
  const issues: ReceiptValidationIssue[] = [];
  let checkedFiles = 0;
  let signatureVerified: boolean | null = null;
  let receipt: DecisionReceipt | null = null;

  if (!("receipt.json" in bundle)) {
    issue(issues, "/receipt.json", "receipt_missing", "receipt.json is missing.");
  } else {
    try {
      const parsed: unknown = JSON.parse(text(bundle["receipt.json"]!));
      const validation = validateDecisionReceipt(parsed);
      issues.push(...validation.issues);
      receipt = validation.receipt;
    } catch (error) {
      issue(issues, "/receipt.json", "receipt_json_invalid", `Could not parse receipt.json: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }

  let manifest: ReceiptIntegrityManifest | null = null;
  if (!("integrity-manifest.json" in bundle)) {
    issue(issues, "/integrity-manifest.json", "manifest_missing", "integrity-manifest.json is missing.");
  } else {
    try {
      const parsed: unknown = JSON.parse(text(bundle["integrity-manifest.json"]!));
      if (
        !isRecord(parsed) ||
        parsed.type !== "receipt-integrity-manifest" ||
        parsed.schemaVersion !== DECISION_RECEIPT_SCHEMA_VERSION ||
        !isSupportedDecisionReceiptSpecVersion(parsed.specVersion) ||
        parsed.algorithm !== "sha256" ||
        parsed.receiptPath !== "receipt.json" ||
        !Array.isArray(parsed.files)
      ) {
        issue(issues, "/integrity-manifest.json", "manifest_contract_invalid", "Integrity manifest has an unsupported contract.");
      } else {
        const malformedEntries = parsed.files.filter((entry) =>
          !isRecord(entry) ||
          !isSafeRelativeReceiptPath(entry.path) ||
          !/^[a-f0-9]{64}$/.test(String(entry.sha256)) ||
          !Number.isSafeInteger(entry.bytes) ||
          Number(entry.bytes) < 0
        );
        if (malformedEntries.length > 0) {
          issue(issues, "/integrity-manifest.json/files", "manifest_file_invalid", "Integrity manifest contains a malformed file entry.");
        } else {
          manifest = parsed as unknown as ReceiptIntegrityManifest;
        }
      }
    } catch (error) {
      issue(issues, "/integrity-manifest.json", "manifest_json_invalid", `Could not parse integrity manifest: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }

  if (manifest) {
    const seen = new Set<string>();
    for (const entry of manifest.files) {
      checkedFiles += 1;
      if (!isSafeRelativeReceiptPath(entry.path)) {
        issue(issues, "/integrity-manifest.json/files", "manifest_path_unsafe", `Manifest path escapes the bundle: ${entry.path}.`);
        continue;
      }
      if (seen.has(entry.path)) {
        issue(issues, "/integrity-manifest.json/files", "manifest_path_duplicate", `Manifest path is duplicated: ${entry.path}.`);
        continue;
      }
      seen.add(entry.path);
      const file = bundle[entry.path];
      if (file === undefined) {
        issue(issues, `/files/${entry.path}`, "integrity_file_missing", `Manifest file is missing: ${entry.path}.`);
        continue;
      }
      const fileBytes = bytes(file);
      if (fileBytes.byteLength !== entry.bytes) {
        issue(issues, `/files/${entry.path}`, "integrity_byte_count_mismatch", `Byte count mismatch: ${entry.path}.`);
      }
      if (await sha256Hex(file) !== entry.sha256) {
        issue(issues, `/files/${entry.path}`, "integrity_hash_mismatch", `SHA-256 mismatch: ${entry.path}.`);
      }
    }
  }

  if (receipt) {
    for (const source of receipt.sources) {
      if (!source.snapshotPath) continue;
      const snapshot = bundle[source.snapshotPath];
      if (snapshot === undefined) {
        issue(issues, `/sources/${source.id}/snapshotPath`, "snapshot_missing", `Source snapshot is missing: ${source.snapshotPath}.`);
        continue;
      }
      if (source.snapshotSha256 && await sha256Hex(snapshot) !== source.snapshotSha256) {
        issue(issues, `/sources/${source.id}/snapshotSha256`, "snapshot_hash_mismatch", `Source snapshot hash mismatch: ${source.id}.`);
      }
      const snapshotText = text(snapshot);
      for (const claim of receipt.claims) {
        for (const evidence of claim.evidence.filter((item) => item.sourceId === source.id)) {
          if (!snapshotText.includes(evidence.excerpt)) {
            issue(issues, `/claims/${claim.id}/evidence/${evidence.id}`, "evidence_excerpt_absent", `Evidence excerpt is absent from ${source.snapshotPath}.`);
          }
        }
      }
    }
    if (receipt.signature) {
      try {
        signatureVerified = await verifySignature(receipt);
        if (!signatureVerified) issue(issues, "/signature", "signature_mismatch", `Receipt signature verification failed for key ${receipt.signature.keyId}.`);
      } catch (error) {
        issue(issues, "/signature", "signature_unverifiable", `Could not verify signature: ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    errors: issues.map((item) => `${item.path}: ${item.message}`),
    receipt: issues.length === 0 ? receipt : null,
    checkedFiles,
    signatureVerified
  };
}
