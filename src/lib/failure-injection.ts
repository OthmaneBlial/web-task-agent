export function shouldInjectFailure(point: string): boolean {
  const configured = String(process.env.WEB_TASK_AGENT_FAIL_POINT ?? "").trim();
  return configured === point || configured === "all";
}

export function injectFailure(point: string): void {
  if (shouldInjectFailure(point)) {
    throw new Error(`Injected failure at ${point}`);
  }
}
