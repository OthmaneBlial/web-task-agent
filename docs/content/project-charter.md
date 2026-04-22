# Project Charter

This page is the working reference for how Web Task Agent should evolve.

## North Star

Web Task Agent should be a local-first research system that can:

- run long jobs without losing progress
- preserve evidence and provenance
- produce useful outputs instead of raw notes
- stay understandable to one operator on one machine

## Core Vocabulary

Use these terms consistently across docs, CLI output, and implementation notes:

- `job`: one research run with its own state and outputs
- `workflow`: a predefined job shape with its own presets and defaults
- `queue item`: a job waiting for a worker to claim it
- `artifact`: a file output registered in SQLite
- `source`: a canonicalized web reference that may be reused across runs
- `document`: a fetched or stored page snapshot
- `snapshot`: a stored capture of page content or state
- `extraction`: structured evidence pulled from a document
- `evidence cluster`: grouped claims and supporting material
- `handoff package`: the final workflow bundle that a human or downstream tool can use

## Architecture Map

The canonical flow is:

1. CLI command enters through `src/cli.ts`
2. The job is created or queued in the local store
3. The agent runner executes plan, search, fetch, extract, and synthesize stages
4. Evidence and artifacts are persisted in SQLite and on disk
5. The workflow package is written under `reports/workflows/<template>/<topic-slug>/`
6. The dashboard and API expose the job state back to the operator

## Success Metrics

The project is healthy when:

- a first-time operator can get a useful run working without reading source code
- long runs can recover from interruption without losing the trail
- outputs stay grounded in stored evidence and source traces
- docs stay close to implementation behavior
- tests cover the places where state, recovery, and artifacts can regress

## Maintenance Rules

- Keep runtime data out of git.
- Prefer local, small, reviewable changes over sprawling rewrites.
- Update docs whenever behavior changes.
- Treat the living roadmap as an execution checklist, not a wish list.
- Capture a commit reference when a phase is complete.

## Runtime Layout

The project uses a small number of stable locations:

- `.cache/` for resumable local state
- `.data/` for durable SQLite data
- `reports/` for generated reports and workflow packages
- `base/` for the private living roadmap and other local-only planning notes

## First Operator Journey

The shortest useful path should stay simple:

1. install dependencies
2. start Lightpanda
3. run a workflow or direct agent job
4. inspect the report package
5. open the local dashboard if the run is long or needs recovery

## Quality Gate

Before a major change is considered done:

- the relevant tests should pass
- the docs should describe the new behavior
- the output package should still be easy to inspect
- the change should not break recovery, queueing, or artifact paths
