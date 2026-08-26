const WORKFLOW_SUBCOMMANDS = new Set(["list", "preview", "run", "enqueue", "scaffold", "help"]);

export function normalizeCliArgv(argv: readonly string[]): string[] {
  const normalized = [...argv];

  if (normalized[2] !== "workflow") {
    return normalized;
  }

  const nextToken = normalized[3];
  if (!nextToken || nextToken.startsWith("-") || WORKFLOW_SUBCOMMANDS.has(nextToken)) {
    return normalized;
  }

  normalized.splice(3, 0, "run");
  return normalized;
}
