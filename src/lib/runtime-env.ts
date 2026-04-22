const LLM_API_KEY_ENV_VARS = ["ANTHROPIC_API_KEY", "ZAI_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;

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
