const SECRET_PATTERNS: RegExp[] = [
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{12,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\bBasic\s+[A-Za-z0-9+/=]{12,}/gi,
  /\b((?:[A-Z0-9]+[_-])*(?:API[_-]?(?:KEY|TOKEN)|ACCESS[_-]?(?:KEY|TOKEN)|AUTH(?:ORIZATION|[_-]?TOKEN)|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|PASSWORD|PASSPHRASE|SECRET|TOKEN|COOKIE|CREDENTIALS?))(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"'&,;]+)/gi
];

export function redactSensitiveText(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match, key: unknown, separator: unknown) => {
      if (typeof key !== "string" || typeof separator !== "string") return "[REDACTED]";
      const originalValue = match.slice(key.length + separator.length);
      const quote = originalValue[0] === originalValue.at(-1) && /["']/.test(originalValue[0] ?? "")
        ? originalValue[0]
        : "";
      return `${key}${separator}${quote}[REDACTED]${quote}`;
    });
  }
  return output;
}
