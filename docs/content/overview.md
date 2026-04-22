# Overview

Web Task Agent is a **local-first long-running web research system** built on top of Lightpanda, Chrome DevTools Protocol, SQLite, and an Anthropic-compatible LLM endpoint.

It is not just a browser automation script. The current repository already supports:

- Planning a job before research starts
- Searching multiple queries
- Fetching result pages in batches
- Persisting sources, documents, extractions, and artifacts
- Synthesizing persisted evidence into a report
- Queueing jobs for local worker execution
- Recovering interrupted work instead of restarting from zero
- Inspecting jobs through a local dashboard and API

The working charter for the project lives in [Project Charter](project-charter.md). It defines the north star, vocabulary, architecture map, runtime layout, and quality gate that the rest of the docs follow.

## What It Is Good At

- Long research runs that may take hours
- Market or product research where you need durable notes and evidence
- Technical article research that should preserve contradictions and source traces
- Local operator workflows where everything should stay on one machine

## What The System Produces

The project writes both **database state** and **file artifacts**.

- SQLite stores jobs, steps, queue state, sources, canonical URLs, documents, extractions, evidence clusters, contradictions, graph links, and artifact metadata.
- The filesystem stores cache snapshots, reports, workflow briefs, raw research JSON, pipeline manifests, and prompt traces.

## Built-In Workflow Entry Points

- `android-opportunity`
- `article-research`

Both workflow templates produce topic-based output folders under `reports/workflows/<template>/<topic-slug>/`.

## Main Operator Surfaces

- CLI for running, queueing, controlling, and inspecting work
- Local worker mode for processing queued jobs
- Local management server with HTML dashboard
- JSON API for jobs, queue state, controls, recoverable runs, and logs

## Current Position

The repository is already mature enough to be useful for deep research on one machine. The main unfinished area is the final hardening pass around tests, failure modes, operator debugging, and tighter docs-to-code parity.
