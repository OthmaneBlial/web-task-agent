import os from "node:os";
import path from "node:path";

import { redactSensitiveText as redactText } from "../../packages/decision-receipt/dist/redaction";

const SECRET_FIELD_NAME = /(?:API[_-]?(?:KEY|TOKEN)|ACCESS[_-]?(?:KEY|TOKEN)|AUTH(?:ORIZATION|[_-]?TOKEN)|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|PASSWORD|PASSPHRASE|SECRET|TOKEN|COOKIE|CREDENTIALS?)$/i;
const LOCAL_PATH_FIELD_NAME = /(?:path|dir|directory)$/i;

export function redactSensitiveText(value: string): string {
  const localPaths = [os.homedir(), process.env.HOME, process.env.USERPROFILE]
    .filter((item): item is string => Boolean(item));
  const sensitiveValues = Object.entries(process.env).flatMap(([key, item]) =>
    SECRET_FIELD_NAME.test(key) && item && item.length >= 8 ? [item] : []
  );
  return redactText(value, localPaths, sensitiveValues);
}

export function redactSensitiveValue(value: unknown, depth: number = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    const absolutePath = typeof item === "string" && (path.isAbsolute(item) || path.win32.isAbsolute(item));
    return [
      key,
      SECRET_FIELD_NAME.test(key) && item !== null && item !== undefined
        ? "[REDACTED]"
        : LOCAL_PATH_FIELD_NAME.test(key) && absolutePath
          ? "[LOCAL_PATH]"
          : redactSensitiveValue(item, depth + 1)
    ];
  }));
  return value;
}
