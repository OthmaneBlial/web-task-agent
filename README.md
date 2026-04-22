# Web Task Agent

Long-running web research agent built on Lightpanda, CDP, SQLite, and an Anthropic-compatible LLM endpoint.

This repository is now a practical research system, not just a small browser automation demo. It can run long jobs, persist evidence, recover interrupted work, reuse sources across runs, queue jobs for workers, and expose a local dashboard for monitoring.

`README.md` explains what the project does now and how to use it.
`ROADMAP.md` is the clean macro roadmap.
`base/roadmap.md` is the private living execution roadmap.
`docs/content/project-charter.md` is the working reference for the project north star, vocabulary, and operating rules.

## What It Does Now

- Runs research jobs that plan, search, fetch, extract, synthesize, and write reports.
- Persists jobs, steps, sources, documents, snapshots, extractions, evidence links, and artifact metadata in SQLite.
- Recovers interrupted runs with leases, heartbeats, resumable cache state, and stage-level resume.
- Reuses canonicalized sources and stored page snapshots across runs.
- Supports built-in workflows for `android-opportunity` and `article-research`.
- Gives workflows stable topic-based cache/report paths, operator presets, and handoff packages.
- Stores local prompt/version traces for agent runs under the runtime artifact folder.
- Supports queued execution with worker mode.
- Exposes a local HTTP API and HTML dashboard for jobs, queue state, controls, and live logs.
- Applies research-quality hardening with domain policies, search-result ranking, source-specific extractors, and trend-aware evidence scoring.
- Uses a shared vocabulary for jobs, workflows, queue items, artifacts, sources, documents, snapshots, extractions, and evidence clusters.

## Main Commands

```bash
# Install and start Lightpanda
npm install
npm run lightpanda:start

# General research job
npm run start -- agent run \
  "Research cheerful launch ideas for our product and write one evidence-backed post" \
  --research-duration "30m"

# Built-in workflow templates
npm run start -- workflow list
npm run start -- workflow run android-opportunity \
  --topic "ai study planner" \
  --preset deep
npm run start -- workflow run article-research \
  --topic "browser automation with Lightpanda and CDP"

# Queue long jobs
npm run start -- workflow enqueue android-opportunity \
  --topic "budgeting app for couples" \
  --research-duration "2h"
npm run start -- queue list
npm run start -- queue pause <queue-id>
npm run start -- queue resume <queue-id>
npm run start -- worker run --once

# Job controls and logs
npm run start -- job pause <job-id>
npm run start -- job resume <job-id>
npm run start -- job rerun <job-id>
npm run start -- job logs <job-id> --limit 100

# Monitoring API and dashboard
npm run start -- server run --port 4317
```

## Quick Start

1. Copy the environment file and fill in your API key.
2. Install dependencies.
3. Start Lightpanda.
4. Run `workflow run article-research` first if you want a structured, low-friction first pass.
5. Use `agent run` when you want a free-form instruction without a template.
6. Start the local dashboard if you want to inspect jobs and queue state in the browser.

The fastest productive path for a new setup is usually:

```bash
npm run start -- workflow run article-research \
  --topic "browser automation with Lightpanda and CDP"
```

`--research-duration` accepts values like `10m`, `30 minutes`, `1h`, or `2 hours`. When set, the agent keeps expanding into new queries and filters out already-covered sites until that research budget is used.

## Current System Shape

The project currently has these main layers:

- Browser automation with Lightpanda over CDP.
- Task orchestration for `github`, `playstore`, and long-form `agent` research.
- Durable storage in `.data/web-task-agent.sqlite`.
- Artifact files in `reports/` and `.cache/`, with their metadata registered in SQLite.
- Resumable local state in `.cache/`.
- Queue and worker execution for long-running jobs.
- Local management API and dashboard.
- Workflow output packaging under `reports/workflows/<template>/<topic-slug>/`.

The canonical flow is:

1. CLI command enters through `src/cli.ts`.
2. The job is created or queued in the local store.
3. The agent runner executes plan, search, fetch, extract, and synthesize stages.
4. Evidence and artifacts are persisted in SQLite and on disk.
5. The workflow package is written under `reports/workflows/<template>/<topic-slug>/`.
6. The dashboard and API expose the job state back to the operator.

## Project Charter

See [docs/content/project-charter.md](docs/content/project-charter.md) for the north star, vocabulary, maintenance rules, runtime layout, and quality gate.
Use the charter as the canonical source for terminology when a command, doc, or code path could use more than one name.

## Workflow Packages

Workflow runs now default to stable topic-based folders instead of generic one-off report directories. A typical workflow package looks like this:

```text
report.md
handoff/
  README.md
  package-manifest.json
  research-summary.md
  workflow-brief.md
drafts/
  post-draft.md
  comments-draft.md
plan/
  plan.json
raw/
  research/
runtime/
  llm-prompt-traces.json
  pipeline-manifest.json
```

Repo examples:

- [examples/workflows/android-opportunity.md](examples/workflows/android-opportunity.md)
- [examples/workflows/article-research.md](examples/workflows/article-research.md)

## Monitoring Surface

The dashboard is served from the local management server root:

- `GET /`
- `GET /api/health`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events`
- `GET /api/jobs/:id/events/stream`
- `POST /api/jobs/:id/control`
- `GET /api/queue`
- `POST /api/queue/:id/control`
- `GET /api/recoverable`

## Project Layout

- [src/cli.ts](src/cli.ts) contains the CLI entrypoints.
- [src/tasks/agent-runner.ts](src/tasks/agent-runner.ts) orchestrates staged research jobs.
- [src/lib/job-store.ts](src/lib/job-store.ts) contains the SQLite job, evidence, and graph store.
- [src/lib/job-queue.ts](src/lib/job-queue.ts) contains queue persistence.
- [src/tasks/queue-worker.ts](src/tasks/queue-worker.ts) runs queued jobs.
- [src/server/management-server.ts](src/server/management-server.ts) serves the local API and dashboard.
- [src/workflows/index.ts](src/workflows/index.ts) defines the built-in workflow templates.

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

- Queue and job controls are now implemented, but only agent jobs support graceful pause, cancel, resume, and rerun.
- Research quality is stronger now, but extraction, ranking, and trend scoring are still heuristic rather than model-verified or domain-trained.
- Workflow outputs are cleaner now, but there are still only two built-in workflow templates and the fixture coverage is still narrow.
- Prompt/version traceability is local-first, but today it is centered on agent runs rather than every LLM-using task.
- Automated tests now cover queue recovery, control helpers, management API endpoints, research quality, and workflow packaging, but broader failure-mode and fixture coverage is still thin compared with the size of the system.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the simplified macro roadmap and the next priorities.
