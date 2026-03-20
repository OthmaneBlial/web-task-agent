# Roadmap

Current progress: the core platform is built. The project can now run long research jobs, store and reuse evidence, queue work for workers, expose a local dashboard, control jobs in flight, stream live logs, apply a hardened research pipeline before synthesis, and generate cleaner workflow handoff packages. The next phase is production hardening.

Recommended next focus: expand tests and production hardening.

## [x] Browser And Task Foundation

The project already has a working CLI, Lightpanda/CDP integration, resumable cache state, and task runners for GitHub, Play Store, and general research jobs.

## [x] Durable Job Execution

Jobs now have leases, heartbeats, stale-run recovery, step tracking, and stage-level resume, including resumed execution after queued stale-run recovery, so long jobs can survive interruptions instead of restarting from zero.

## [x] Deep Research Pipeline

The research flow is split into search, fetch, extract, and synthesize stages, and it can now process large batches instead of only a few pages per run.

## [x] Durable Storage And Reuse

Sources, documents, snapshots, extractions, and artifact metadata are stored in SQLite, and canonicalized sources can be reused across runs to avoid unnecessary refetching.

## [x] Evidence Analysis Layer

The system already deduplicates repeated signals, scores source quality and freshness, detects contradictions, and builds an evidence graph linking sources, documents, extractions, entities, and outputs.

## [x] Workflow Templates

The project now has reusable workflow entrypoints for `android-opportunity` and `article-research`, each with its own defaults and operator-facing CLI flow.

## [x] Queue And Worker Mode

Jobs can now be enqueued, claimed by a worker, heartbeated during execution, retried after failure, and completed through a durable queue stored in SQLite.

## [x] API And Dashboard

There is now a local HTTP management surface for jobs, queue state, recoverable runs, and job detail inspection, plus a simple HTML dashboard.

## [x] Job Controls And Live Logs

The API, CLI, and dashboard now support pause, resume, cancel, retry, and rerun controls, and selected jobs expose live event logs through stored run events and an SSE stream.

## [x] Research Quality Hardening

The research pipeline now applies domain policies, document quality filters, search-result ranking, source-specific extractors for docs/forums/reviews, and trend-aware source and cluster scoring before synthesis.

## [x] Workflow Output Polish

Workflow runs now use topic-based cache and report paths, support `fast`/`standard`/`deep` presets, write cleaner handoff packages, and include repo-side output examples for each built-in workflow.

## [ ] Tests And Production Hardening

The final macro phase is to add fixtures, golden outputs, failure-mode tests, prompt/version tracking, and a cleaner path for multi-worker or Postgres-backed deployments.
