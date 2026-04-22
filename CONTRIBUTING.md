# Contributing

This project is a local-first research system. When you change behavior, keep the code path, the docs, and the tests aligned.

## Start Here

- `src/cli.ts` is the command entry point.
- `src/tasks/agent-runner.ts` orchestrates the long-running research stages.
- `src/lib/job-store.ts` owns durable job, evidence, and artifact state.
- `src/lib/job-queue.ts` owns queued execution.
- `src/server/management-server.ts` serves the dashboard and API.
- `src/workflows/index.ts` defines the built-in workflow templates.

## Main Execution Path

1. A CLI command enters through `src/cli.ts`.
2. The command validates input and builds job options.
3. The job store and queue persist the durable state.
4. The agent runner executes plan, search, fetch, extract, and synthesize stages.
5. Reports, workflow packages, and prompt traces land on disk.
6. The management server exposes the stored state back to the operator.

## Useful Commands

```bash
npm run build
npm test
npm run start -- workflow list
npm run start -- job inspect <job-id>
npm run start -- job report <job-id>
npm run start -- job budget <job-id>
npm run start -- storage maintain
npm run start -- storage cleanup --prompt-traces <path>
```

## When You Change Behavior

- Update the nearest doc page in `docs/content/`.
- Add or extend tests for the changed path.
- Keep command output labels stable when possible.
- Prefer small, focused commits when the change maps cleanly to one behavior.

## Good First Checks

- run `npm run build`
- run the relevant `node --test dist/tests/<file>.test.js` files
- inspect the README and CLI reference for stale examples
- update the stored roadmap entry if the change is part of an active phase

## Project Shape

- `reports/` is for human-facing output.
- `.cache/` is for resumable state.
- `.data/` is for durable database state.
- `base/` stays local-only and ignored by git.

## If You Are Unsure

Read the docs in this order:

1. `README.md`
2. `docs/content/overview.md`
3. `docs/content/getting-started.md`
4. `docs/content/cli-reference.md`
5. `docs/content/project-layout.md`
