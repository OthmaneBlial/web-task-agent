import type { DecisionReceipt } from "./types";

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)])
    );
  }
  return value;
}

export function canonicalizeJson(value: unknown): string {
  return `${JSON.stringify(canonicalValue(value))}\n`;
}

export function canonicalizeReceiptForSigning(receipt: DecisionReceipt): string {
  const unsigned = { ...receipt } as DecisionReceipt & { signature?: DecisionReceipt["signature"] };
  delete unsigned.signature;
  return canonicalizeJson(unsigned);
}
