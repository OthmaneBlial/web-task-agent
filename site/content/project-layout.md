# Project Layout

## Main Entry Points

- `src/cli.ts`
- `src/server/management-server.ts`
- `src/tasks/agent-runner.ts`

## Task Implementations

- `src/tasks/github-scanner.ts`
- `src/tasks/playstore-analyzer.ts`
- `src/tasks/queue-worker.ts`
- `src/tasks/agent/*`

## Core Storage And Runtime Code

- `src/lib/job-store.ts`
- `src/lib/job-queue.ts`
- `src/lib/job-operations.ts`
- `src/lib/cache.ts`
- `src/lib/cdp.ts`
- `src/lib/llm.ts`
- `src/lib/prompt-trace.ts`
- `src/lib/extraction-heuristics.ts`

## Workflow Definitions

- `src/workflows/index.ts`
- `src/workflows/output-package.ts`

## Tests

- `src/tests/queue-recovery.test.ts`
- `src/tests/job-controls.test.ts`
- `src/tests/management-server.test.ts`
- `src/tests/research-quality.test.ts`
- `src/tests/workflow-output.test.ts`
- `src/tests/prompt-trace.test.ts`
- `src/tests/agent-runner-interruptions.test.ts`

## Generated Runtime Locations

- `.cache/`
- `.data/`
- `reports/`
- `reports/workflows/<template>/<topic-slug>/`

## Useful Mental Model

If you want to understand the current architecture quickly:

1. Start at `src/cli.ts`
2. Read `src/tasks/agent-runner.ts`
3. Read `src/lib/job-store.ts`
4. Read `src/lib/job-queue.ts`
5. Read `src/server/management-server.ts`
6. Read `src/workflows/index.ts`
