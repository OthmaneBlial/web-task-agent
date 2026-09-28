const LLM_API_KEY_ENV_VARS = ["ANTHROPIC_API_KEY", "ZAI_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;
const DEFAULT_LLM_TIMEOUT_MS = 90_000;
const MAX_LLM_TIMEOUT_MS = 10 * 60 * 1_000;

export function parseLlmTimeoutMs(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_LLM_TIMEOUT_MS;

  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_LLM_TIMEOUT_MS) {
    throw new Error(`ANTHROPIC_TIMEOUT_MS must be a whole number from 1 to ${MAX_LLM_TIMEOUT_MS} milliseconds.`);
  }
  return timeoutMs;
}

export function getFirstConfiguredEnvValue(envVars: readonly string[]): string | null {
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

export function ensureLlmRuntimeEnvironment(commandName: string): void {
  if (getFirstConfiguredEnvValue(LLM_API_KEY_ENV_VARS)) {
    return;
  }

  throw new Error(
    `${commandName} needs an Anthropic-compatible API key. Set ANTHROPIC_API_KEY, ZAI_API_KEY, or ANTHROPIC_AUTH_TOKEN in .env before running the command.`
  );
}
