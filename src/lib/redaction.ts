import { redactSensitiveText as redactText } from "../../packages/decision-receipt/dist/redaction";

export { redactText as redactSensitiveText };

const SECRET_FIELD_NAME = /(?:API[_-]?(?:KEY|TOKEN)|ACCESS[_-]?(?:KEY|TOKEN)|AUTH(?:ORIZATION|[_-]?TOKEN)|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|PASSWORD|PASSPHRASE|SECRET|TOKEN|COOKIE|CREDENTIALS?)$/i;

export function redactSensitiveValue(value: unknown, depth: number = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    SECRET_FIELD_NAME.test(key) && item !== null && item !== undefined
      ? "[REDACTED]"
      : redactSensitiveValue(item, depth + 1)
  ]));
  return value;
}
