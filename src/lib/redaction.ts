const SECRET_PATTERNS: RegExp[] = [
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{12,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\bBasic\s+[A-Za-z0-9+/=]{12,}/gi,
  /\b((?:[A-Z0-9]+[_-])*(?:API[_-]?(?:KEY|TOKEN)|ACCESS[_-]?(?:KEY|TOKEN)|AUTH(?:ORIZATION|[_-]?TOKEN)|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|PASSWORD|PASSPHRASE|SECRET|TOKEN|COOKIE|CREDENTIALS?))(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"'&,;]+)/gi
];

const SECRET_FIELD_NAME = /(?:API[_-]?(?:KEY|TOKEN)|ACCESS[_-]?(?:KEY|TOKEN)|AUTH(?:ORIZATION|[_-]?TOKEN)|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|PASSWORD|PASSPHRASE|SECRET|TOKEN|COOKIE|CREDENTIALS?)$/i;

export function redactSensitiveText(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (_match, key: unknown, separator: unknown) => {
      if (typeof key !== "string" || typeof separator !== "string") return "[REDACTED]";
      const valueStart = key.length + separator.length;
      const originalValue = _match.slice(valueStart);
      const quote = originalValue[0] === originalValue.at(-1) && /["']/.test(originalValue[0] ?? "")
        ? originalValue[0]
        : "";
      return `${key}${separator}${quote}[REDACTED]${quote}`;
    });
  }
  return output;
}

export function redactSensitiveValue(value: unknown, depth: number = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    SECRET_FIELD_NAME.test(key) && item !== null && item !== undefined
      ? "[REDACTED]"
      : redactSensitiveValue(item, depth + 1)
  ]));
  return value;
}
