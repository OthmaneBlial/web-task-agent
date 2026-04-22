export function formatCliErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    const hints: string[] = [];

    if (/needs an Anthropic-compatible API key/i.test(message)) {
      hints.push("Set ANTHROPIC_API_KEY, ZAI_API_KEY, or ANTHROPIC_AUTH_TOKEN in .env and retry.");
    } else if (/unknown workflow template/i.test(message)) {
      hints.push("Run `web-task-agent workflow list` to see the available templates.");
    } else if (/unknown (job|queue item)/i.test(message)) {
      hints.push(
        "Run `web-task-agent job inspect <job-id>`, `web-task-agent job report <job-id>`, `web-task-agent job budget <job-id>`, or `web-task-agent queue list` to confirm the ID."
      );
    } else {
      hints.push("Run `web-task-agent --help` or `<command> --help` for usage.");
    }

    return [message, ...hints].join("\n");
  }

  return String(error);
}
