import {
  DECISION_RECEIPT_SCHEMA_VERSION,
  DECISION_RECEIPT_SPEC_VERSION,
  type DecisionReceipt
} from "./types";
import { validateDecisionReceipt } from "./validate";

export interface DecisionReceiptMigrationResult {
  receipt: DecisionReceipt;
  migrated: boolean;
  from: "1-experimental" | DecisionReceipt["specVersion"];
  to: typeof DECISION_RECEIPT_SPEC_VERSION;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/**
 * Migrate the unsigned schema-v1 receipt emitted by Web Task Agent 0.5.1 to
 * the first formal Decision Receipt spec. Unknown versions and experimental
 * signatures fail closed because their signed bytes cannot be preserved.
 */
export function migrateDecisionReceipt(value: unknown): DecisionReceiptMigrationResult {
  const current = validateDecisionReceipt(value);
  if (current.valid && current.receipt) {
    return {
      receipt: current.receipt,
      migrated: false,
      from: current.receipt.specVersion,
      to: DECISION_RECEIPT_SPEC_VERSION,
      warnings: []
    };
  }
  if (!isRecord(value) || value.schemaVersion !== DECISION_RECEIPT_SCHEMA_VERSION) {
    throw new Error("Only the experimental schema-v1 Decision Receipt can migrate to spec 1.0.0.");
  }
  if (value.specVersion !== undefined) {
    throw new Error(`Unsupported Decision Receipt spec version: ${String(value.specVersion)}.`);
  }
  if (value.signature !== undefined) {
    throw new Error("Remove and re-create the experimental signature after migration; its signed bytes are not v1-compatible.");
  }

  const migrated = cloneRecord(value);
  migrated.specVersion = DECISION_RECEIPT_SPEC_VERSION;
  migrated.profile = isRecord(migrated.provenance) && migrated.provenance.kind === "imported" ? "minimal" : "full";
  const validation = validateDecisionReceipt(migrated);
  if (!validation.valid || !validation.receipt) {
    throw new Error(`Experimental receipt cannot migrate cleanly: ${validation.errors.join("; ")}`);
  }
  return {
    receipt: validation.receipt,
    migrated: true,
    from: "1-experimental",
    to: DECISION_RECEIPT_SPEC_VERSION,
    warnings: [
      "The migration adds formal spec and profile identifiers but does not establish source truth or freshness.",
      "Regenerate integrity-manifest.json after writing the migrated receipt."
    ]
  };
}
