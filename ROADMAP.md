# Roadmap

Current progress: the core platform is built. The project can now run long research jobs, store and reuse evidence, queue work for workers, expose a local dashboard, control jobs in flight, and stream live logs. The next phase is about research quality, output polish, and hardening.

Recommended next focus: improve research quality first, then polish workflow outputs and expand test coverage.

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

## [ ] Research Quality Hardening

The research-quality phase now has a first pass of document quality filters and domain policies, but it still needs source-specific extractors, better ranking, and trend scoring so the evidence gets cleaner before synthesis.

## [ ] Workflow Output Polish

The workflow layer still needs cleaner output folders, example reports, presets, and stronger defaults so each workflow feels like a polished product instead of a powerful internal tool.

## [ ] Tests And Production Hardening

The final macro phase is to add fixtures, golden outputs, failure-mode tests, prompt/version tracking, and a cleaner path for multi-worker or Postgres-backed deployments.
