const SECRET_PATTERNS: RegExp[] = [
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{12,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\b(ANTHROPIC_API_KEY|ZAI_API_KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY)\s*([=:])\s*[^\s"']+/gi
];

export function redactSensitiveText(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (_match, key: unknown, separator: unknown) =>
      typeof key === "string" && typeof separator === "string" && /API_KEY|AUTH_TOKEN/i.test(key)
        ? `${key}${separator}[REDACTED]`
        : "[REDACTED]"
    );
  }
  return output;
}

export function redactSensitiveValue(value: unknown, depth: number = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactSensitiveValue(item, depth + 1)]));
  return value;
}
