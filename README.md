# Web Task Agent

Long-running web research agent built on Lightpanda, CDP, SQLite, and an Anthropic-compatible LLM endpoint.

This repository is now a practical research system, not just a small browser automation demo. It can run long jobs, persist evidence, recover interrupted work, reuse sources across runs, queue jobs for workers, and expose a local dashboard for monitoring.

`README.md` explains what the project does now and how to use it.
`ROADMAP.md` is the clean macro roadmap.

## What It Does Now

- Runs research jobs that plan, search, fetch, extract, synthesize, and write reports.
- Persists jobs, steps, sources, documents, snapshots, extractions, evidence links, and artifact metadata in SQLite.
- Recovers interrupted runs with leases, heartbeats, resumable cache state, and stage-level resume.
- Reuses canonicalized sources and stored page snapshots across runs.
- Supports built-in workflows for `android-opportunity` and `article-research`.
- Supports queued execution with worker mode.
- Exposes a local HTTP API and HTML dashboard for jobs and queue state.

## Main Commands

```bash
# Install and start Lightpanda
npm install
npm run lightpanda:start

# General research job
npm run start -- agent run \
  "Research cheerful launch ideas for our product and write one evidence-backed post"

# Built-in workflow templates
npm run start -- workflow list
npm run start -- workflow run android-opportunity \
  --topic "ai study planner"
npm run start -- workflow run article-research \
  --topic "browser automation with Lightpanda and CDP"

# Queue long jobs
npm run start -- workflow enqueue android-opportunity \
  --topic "budgeting app for couples"
npm run start -- queue list
npm run start -- worker run --once

# Monitoring API and dashboard
npm run start -- server run --port 4317
```

## Quick Start

1. Copy the environment file and fill in your API key.
2. Install dependencies.
3. Start Lightpanda.
4. Run either a direct `agent run` job or a `workflow run` template.
5. Start the local dashboard if you want to inspect jobs and queue state in the browser.

## Current System Shape

The project currently has these main layers:

- Browser automation with Lightpanda over CDP.
- Task orchestration for `github`, `playstore`, and long-form `agent` research.
- Durable storage in `.data/web-task-agent.sqlite`.
- Artifact files in `reports/` and `.cache/`, with their metadata registered in SQLite.
- Resumable local state in `.cache/`.
- Queue and worker execution for long-running jobs.
- Local management API and dashboard.

## Monitoring Surface

The dashboard is served from the local management server root:

- `GET /`
- `GET /api/health`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/queue`
- `GET /api/recoverable`

## Project Layout

- [src/cli.ts](/home/othmane/Downloads/web-task-agent/src/cli.ts) contains the CLI entrypoints.
- [src/tasks/agent-runner.ts](/home/othmane/Downloads/web-task-agent/src/tasks/agent-runner.ts) orchestrates staged research jobs.
- [src/lib/job-store.ts](/home/othmane/Downloads/web-task-agent/src/lib/job-store.ts) contains the SQLite job, evidence, and graph store.
- [src/lib/job-queue.ts](/home/othmane/Downloads/web-task-agent/src/lib/job-queue.ts) contains queue persistence.
- [src/tasks/queue-worker.ts](/home/othmane/Downloads/web-task-agent/src/tasks/queue-worker.ts) runs queued jobs.
- [src/server/management-server.ts](/home/othmane/Downloads/web-task-agent/src/server/management-server.ts) serves the local API and dashboard.
- [src/workflows/index.ts](/home/othmane/Downloads/web-task-agent/src/workflows/index.ts) defines the built-in workflow templates.

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

## Current Limitations

- The dashboard is currently read-focused; pause, resume, cancel, rerun, and live log streaming are not implemented yet.
- Research quality still relies on generic heuristics in several places and needs stronger source-specific extractors.
- Automated tests and fixture coverage are still thin compared with the size of the system.

## Roadmap

See [ROADMAP.md](/home/othmane/Downloads/web-task-agent/ROADMAP.md) for the simplified macro roadmap and the next priorities.
