const SECRET_PATTERNS: RegExp[] = [
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{12,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\bBasic\s+[A-Za-z0-9+/=]{12,}/gi,
  /\b((?:[A-Z0-9]+[_-])*(?:API[_-]?(?:KEY|TOKEN)|ACCESS[_-]?(?:KEY|TOKEN)|AUTH(?:ORIZATION|[_-]?TOKEN)|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|PASSWORD|PASSPHRASE|SECRET|TOKEN|COOKIE|CREDENTIALS?))(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"'&,;]+)/gi
];
const EMAIL_ADDRESS_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

export function redactSensitiveText(
  value: string,
  localPaths: readonly string[] = [],
  sensitiveValues: readonly string[] = []
): string {
  let output = value;
  for (const sensitiveValue of sensitiveValues.filter((item) => item.length >= 8).sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(sensitiveValue, "[REDACTED]");
  }
  for (const localPath of new Set(localPaths.filter((item) => item.length >= 4))) {
    const pathPattern = new RegExp(escapeRegExp(localPath) + "(?:[\\\\/][^\\s\"'<>;,)]*)*", "g");
    output = output.replace(pathPattern, "[LOCAL_PATH]");
  }
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
  return output.replace(EMAIL_ADDRESS_PATTERN, "[REDACTED_EMAIL]");
}
