import type { StorageHealthAssessment } from "./storage-validation";

interface QueueHealthSnapshot {
  queued: number;
  running: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface ProductionHardeningGateInput {
  storage: StorageHealthAssessment;
  queue: QueueHealthSnapshot;
  recoverableJobs: number;
}

export interface ProductionHardeningGateCheck {
  label: string;
  passed: boolean;
  details: string;
}

export interface ProductionHardeningGateResult {
  passed: boolean;
  checks: ProductionHardeningGateCheck[];
  queue: QueueHealthSnapshot;
}

export function evaluateProductionHardeningGate(
  input: ProductionHardeningGateInput
): ProductionHardeningGateResult {
  const checks: ProductionHardeningGateCheck[] = [
    {
      label: "Storage health",
      passed: input.storage.healthy,
      details: input.storage.healthy
        ? "Storage health looks good."
        : input.storage.warnings.join("; ")
    },
    {
      label: "Recoverable jobs",
      passed: input.recoverableJobs === 0,
      details:
        input.recoverableJobs === 0
          ? "No recoverable jobs remain."
          : `${input.recoverableJobs} recoverable job${input.recoverableJobs === 1 ? "" : "s"} need attention.`
    },
    {
      label: "Paused queue items",
      passed: input.queue.paused === 0,
      details:
        input.queue.paused === 0
          ? "No paused queue items remain."
          : `${input.queue.paused} paused queue item${input.queue.paused === 1 ? "" : "s"} remain.`
    },
    {
      label: "Failed queue items",
      passed: input.queue.failed === 0,
      details:
        input.queue.failed === 0
          ? "No failed queue items remain."
          : `${input.queue.failed} failed queue item${input.queue.failed === 1 ? "" : "s"} remain.`
    }
  ];

  return {
    passed: checks.every((check) => check.passed),
    checks,
    queue: input.queue
  };
}

export function formatProductionHardeningGateLines(result: ProductionHardeningGateResult): string[] {
  const lines = [`Production Hardening Gate: ${result.passed ? "PASS" : "FAIL"}`];

  for (const check of result.checks) {
    lines.push(`- ${check.label}: ${check.passed ? "ok" : "needs attention"}`);
    lines.push(`  ${check.details}`);
  }

  lines.push(
    `- Queue activity: queued ${result.queue.queued}, running ${result.queue.running}, completed ${result.queue.completed}, cancelled ${result.queue.cancelled}`
  );

  return lines;
}
