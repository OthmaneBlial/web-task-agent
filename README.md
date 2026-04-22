# Web Task Agent

Local-first web research with Lightpanda, Chrome DevTools Protocol, SQLite, and an Anthropic-compatible LLM endpoint.

It is built for long jobs that need durable state, evidence, recovery, queueing, and a local dashboard.

## What It Does

- runs free-form research jobs with `agent run`
- runs opinionated templates with `workflow run`
- queues work for a local worker
- persists jobs, steps, sources, evidence, artifacts, and prompt traces
- resumes interrupted work instead of starting over
- exposes a local HTTP API and HTML dashboard
- writes topic-based workflow packages under `reports/workflows/<template>/<topic-slug>/`

## Quick Start

```bash
npm install
npm run lightpanda:start
npm run start -- workflow run article-research --topic "browser automation with Lightpanda and CDP"
npm run start -- server run --port 4317
```

If you want a direct job instead of a template, use:

```bash
npm run start -- agent run "Research cheerful launch ideas for our product and write one evidence-backed post"
```

## Common Commands

```bash
npm run start -- workflow list
npm run start -- workflow run android-opportunity --topic "budgeting app for couples"
npm run start -- workflow enqueue android-opportunity --topic "budgeting app for couples"
npm run start -- agent enqueue "Research a local-first note app"
npm run start -- queue list
npm run start -- queue stats
npm run start -- job inspect <job-id>
npm run start -- job report <job-id>
npm run start -- job budget <job-id>
npm run start -- job logs <job-id> --limit 100
npm run start -- storage maintain
npm run start -- storage cleanup --prompt-traces <path>
npm run start -- worker run --once
npm run start -- server run --port 4317
```

## Output Locations

- `.cache/` stores resumable local state
- `.data/web-task-agent.sqlite` stores durable job and queue data
- `reports/` stores human-facing reports and workflow packages
- `reports/workflows/<template>/<topic-slug>/` stores the stable workflow handoff bundle

## Environment

```env
CDP_PORT=9222
LIGHTPANDA_DISABLE_TELEMETRY=true
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_TIMEOUT_MS=90000
WEB_TASK_AGENT_DB_PATH=.data/web-task-agent.sqlite
```

## Documentation

- [Project Charter](docs/content/project-charter.md)
- [Overview](docs/content/overview.md)
- [Getting Started](docs/content/getting-started.md)
- [CLI Reference](docs/content/cli-reference.md)
- [Queue, Worker, And Controls](docs/content/queue-worker-controls.md)
- [Project Layout](docs/content/project-layout.md)
- [Testing And Hardening](docs/content/testing-and-roadmap.md)

## Project Layout

- `src/cli.ts` contains the CLI entry points.
- `src/tasks/agent-runner.ts` orchestrates staged research jobs.
- `src/lib/job-store.ts` contains the SQLite job, evidence, and artifact store.
- `src/lib/job-queue.ts` contains queue persistence.
- `src/tasks/queue-worker.ts` runs queued jobs.
- `src/server/management-server.ts` serves the local API and dashboard.
- `src/workflows/index.ts` defines the built-in workflow templates.

## Notes

- The built-in workflows are `android-opportunity` and `article-research`.
- `job report` gives a recovery-focused summary.
- `job budget` gives a soft latency budget view.
- `storage cleanup` trims prompt-trace manifests without touching evidence artifacts.
