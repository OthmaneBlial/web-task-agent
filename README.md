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
curl -fsSL https://raw.githubusercontent.com/OthmaneBlial/web-task-agent/main/install.sh | bash
web-task-agent workflow run article-research --topic "browser automation with Lightpanda and CDP"
web-task-agent server run --port 4317
```

If you want a direct job instead of a template, use:

```bash
web-task-agent agent run "Research cheerful launch ideas for our product and write one evidence-backed post"
```

## Common Commands

```bash
web-task-agent workflow list
web-task-agent workflow run android-opportunity --topic "budgeting app for couples"
web-task-agent workflow enqueue android-opportunity --topic "budgeting app for couples"
web-task-agent agent enqueue "Research a local-first note app"
web-task-agent queue list
web-task-agent queue stats
web-task-agent job inspect <job-id>
web-task-agent job report <job-id>
web-task-agent job budget <job-id>
web-task-agent job logs <job-id> --limit 100
web-task-agent storage maintain
web-task-agent storage cleanup --prompt-traces <path>
web-task-agent storage gate
web-task-agent worker run --once
web-task-agent server run --port 4317
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

- [Platform](docs/content/platform.md)
- [Project Charter](docs/content/project-charter.md)
- [Overview](docs/content/overview.md)
- [Getting Started](docs/content/getting-started.md)
- [CLI Reference](docs/content/cli-reference.md)
- [Queue, Worker, And Controls](docs/content/queue-worker-controls.md)
- [Project Layout](docs/content/project-layout.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Testing And Hardening](docs/content/testing-and-hardening.md)

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
