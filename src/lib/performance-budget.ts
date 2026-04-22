import type { StoredJobDetail, StoredJobStepRecord } from "./job-store";

interface PerformanceBudgetThresholds {
  searchMs: number;
  fetchMs: number;
  extractionMs: number;
  synthesisMs: number;
}

interface PerformanceBudgetCheck {
  label: string;
  observedMs: number;
  thresholdMs: number;
  exceeded: boolean;
}

const DEFAULT_THRESHOLDS: PerformanceBudgetThresholds = {
  searchMs: 2 * 60 * 1000,
  fetchMs: 8 * 60 * 1000,
  extractionMs: 8 * 60 * 1000,
  synthesisMs: 5 * 60 * 1000
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

function stepDuration(step: StoredJobStepRecord): number {
  if (typeof step.durationMs === "number" && Number.isFinite(step.durationMs)) {
    return Math.max(0, Math.round(step.durationMs));
  }

  if (step.startedAt && step.completedAt) {
    return Math.max(0, Date.parse(step.completedAt) - Date.parse(step.startedAt));
  }

  return 0;
}

function matchesCategory(step: StoredJobStepRecord, category: "search" | "fetch" | "extraction" | "synthesis"): boolean {
  const haystack = `${step.kind} ${step.title} ${step.stepKey}`.toLowerCase();

  switch (category) {
    case "search":
      return haystack.includes("search") || haystack.includes("scan");
    case "fetch":
      return haystack.includes("fetch") || haystack.includes("browser");
    case "extraction":
      return haystack.includes("extract") || haystack.includes("evidence");
    case "synthesis":
      return haystack.includes("synth") || haystack.includes("summary") || haystack.includes("draft");
  }
}

function sumCategoryDuration(
  steps: StoredJobStepRecord[],
  category: "search" | "fetch" | "extraction" | "synthesis"
): number {
  return steps.filter((step) => matchesCategory(step, category)).reduce((sum, step) => sum + stepDuration(step), 0);
}

export function evaluatePerformanceBudgets(
  detail: StoredJobDetail,
  thresholds: Partial<PerformanceBudgetThresholds> = {}
): {
  checks: PerformanceBudgetCheck[];
  healthy: boolean;
} {
  const budget = {
    ...DEFAULT_THRESHOLDS,
    ...thresholds
  };

  const checks: PerformanceBudgetCheck[] = [
    {
      label: "Search",
      observedMs: sumCategoryDuration(detail.steps, "search"),
      thresholdMs: budget.searchMs,
      exceeded: false
    },
    {
      label: "Fetch",
      observedMs: sumCategoryDuration(detail.steps, "fetch"),
      thresholdMs: budget.fetchMs,
      exceeded: false
    },
    {
      label: "Extraction",
      observedMs: sumCategoryDuration(detail.steps, "extraction"),
      thresholdMs: budget.extractionMs,
      exceeded: false
    },
    {
      label: "Synthesis",
      observedMs: sumCategoryDuration(detail.steps, "synthesis"),
      thresholdMs: budget.synthesisMs,
      exceeded: false
    }
  ];

  for (const check of checks) {
    check.exceeded = check.observedMs > check.thresholdMs;
  }

  return {
    checks,
    healthy: checks.every((check) => !check.exceeded)
  };
}

export function formatStoredJobPerformanceBudgetLines(detail: StoredJobDetail): string[] {
  const evaluation = evaluatePerformanceBudgets(detail);
  const overBudgetChecks = evaluation.checks.filter((check) => check.exceeded);

  return [
    `Performance Budget: ${detail.job.jobId}`,
    ...evaluation.checks.map((check) => {
      const status = check.exceeded ? "over" : "within";
      return `- ${check.label}: ${formatDuration(check.observedMs)} / ${formatDuration(check.thresholdMs)} (${status})`;
    }),
    overBudgetChecks.length > 0
      ? `Warnings: ${overBudgetChecks.map((check) => check.label.toLowerCase()).join(", ")} exceed the soft budget`
      : "Warnings: none"
  ];
}
