# Web Task Agent

Long-running web research agent foundation built on Lightpanda, CDP, and an Anthropic-compatible LLM endpoint.

This repository already has a solid browser automation core. What it does not yet have is the full product layer needed to behave like a serious research worker that can search broadly, collect evidence across many pages, store findings, analyze them, and hand back a trustworthy report. This README turns the project into an executable roadmap so we can build that next.

## Project Status

- [x] TypeScript CLI entrypoint with task-oriented commands in `src/cli.ts`
- [x] Lightpanda CDP session management with a custom flattened target proxy in `src/lib/cdp.ts`
- [x] Human-like scroll and click helpers in `src/lib/humanizer.ts`
- [x] Local resumable task state in `.cache/` via `src/lib/cache.ts`
- [x] LLM-backed repository ranking, market analysis, planning, and draft generation in `src/lib/llm.ts`
- [x] GitHub search scanner in `src/tasks/github-scanner.ts`
- [x] Google Play market analyzer in `src/tasks/playstore-analyzer.ts`
- [x] Lightweight browser research runner in `src/tasks/agent-runner.ts`
- [x] Markdown and JSON artifact output under `reports/`
- [x] SQLite-backed job, step, and artifact persistence under `.data/web-task-agent.sqlite`
- [x] Normalized agent research persistence for queries, sources, and document snapshots
- [ ] Multi-hour job execution with automatic recovery
- [ ] Hundreds-of-pages research per run
- [ ] Durable database-backed source storage
- [ ] Source deduplication and canonicalization across runs
- [ ] Evidence graph linking sources, claims, entities, and outputs
- [ ] Workflow templates for real business research jobs
- [ ] Scheduler, queue, or worker mode
- [ ] API and dashboard for managing runs

## Deep Analysis Of The Current Codebase

### What exists today

- [x] The CLI is clean and easy to extend. Each command maps directly to a task class.
- [x] The CDP layer is the strongest part of the project. It works around Lightpanda's single-WebSocket model instead of assuming standard Chrome flows.
- [x] The cache layer is simple but useful. Every task can checkpoint and resume.
- [x] The agent runner already separates planning, research, synthesis, drafting, and report generation.
- [x] The browser pacing is intentionally humanized, which is valuable for fragile sites.
- [x] Artifact output is understandable: cache in `.cache/`, reports in `reports/`, screenshots in `/tmp`.

### What is limited today

- [ ] The `agent run` flow is still a small research loop, not a deep research engine.
- [ ] Research breadth is capped by `--max-queries` and `--max-results`, with only a few articles deeply opened per query.
- [ ] There is no persistent document store; the system writes final artifacts, not a reusable research corpus.
- [ ] Search, fetch, extract, analyze, and write are still tightly coupled inside task classes.
- [ ] There is no normalized source model with metadata like canonical URL, published date, author, freshness, trust score, or extraction status.
- [ ] There is no long-running orchestration layer for retries, budgets, queues, backoff, scheduling, or concurrency control.
- [ ] There is no workflow abstraction yet; use cases are hardcoded into specific tasks.
- [ ] The current LLM layer mostly works from prompt-local JSON payloads, not from a structured evidence model.
- [ ] There are no tests around scraping selectors, page digest quality, cache resume behavior, or report stability.

### The practical conclusion

- [x] This repo is a strong foundation for browser-driven research.
- [ ] This repo is not yet a full research platform.
- [ ] The next step should not be "add more prompts". The next step should be "add a research system".

## Product Direction

The project should evolve from "a CLI that runs a few smart browser tasks" into "a long-running research agent platform".

That platform should be able to:

- [ ] search across many pages and many source types
- [ ] save raw evidence and structured extracts
- [ ] resume safely after interruptions
- [ ] analyze repeated patterns across sources
- [ ] detect trends, gaps, and opportunities
- [ ] generate reports, briefs, drafts, and datasets
- [ ] keep every conclusion traceable back to sources

## Core Principles

- [ ] Evidence first: every important conclusion should point back to captured sources.
- [ ] Long-running by design: every workflow should survive restarts, failures, and partial completion.
- [ ] Separation of concerns: search, fetch, extract, analyze, synthesize, and publish should be independent stages.
- [ ] Reusability: once a source is fetched and parsed, later workflows should be able to reuse it.
- [ ] Human approval gates: publishing-oriented tasks should stop at review.
- [ ] Honest freshness: time-sensitive outputs should record when the research was collected.

## Example Workflow 1: Android App Opportunity Hunter

This is one of the best target workflows for this repo because the current project already has a Play Store task and a generic browser research task.

### Goal

- [ ] Discover an app category or feature trend that looks promising right now.
- [ ] Search broadly across app stores, product forums, reviews, discussions, and technical sources.
- [ ] Save the evidence.
- [ ] Analyze what users want, what competitors are missing, and what could go viral.
- [ ] Produce a report with concrete app ideas, feature priorities, and positioning.

### Ideal workflow

- [ ] Define a niche or seed prompt such as "AI habit tracker", "study planner", or "budgeting app for couples".
- [ ] Search Google Play for competitors and collect top listings, ratings, descriptions, and review patterns.
- [ ] Search the web for user pain points on forums, blogs, Reddit, Hacker News, Product Hunt, and relevant communities.
- [ ] Extract recurring complaints, requested features, pricing signals, and market saturation clues.
- [ ] Group findings into themes such as "onboarding pain", "retention hooks", "AI novelty", or "privacy concerns".
- [ ] Score opportunities by demand, competition quality, monetization fit, and implementation complexity.
- [ ] Generate a final report with app ideas, viral hooks, MVP features, audience, risks, and launch angles.

### What the current repo can already support

- [x] Play Store scraping and app detail collection
- [x] Small-scale web research from DuckDuckGo HTML
- [x] LLM synthesis into a report
- [x] Resumable local artifacts

### What must be added for this workflow to be truly useful

- [ ] Multi-source research beyond current search and Play Store coverage
- [ ] Larger page budgets and source queues
- [ ] Structured storage for sources and extracted signals
- [ ] Theme clustering and opportunity scoring
- [ ] A reusable "android-opportunity" workflow template

## Example Workflow 2: Technical Article Builder

This is the second strong target because the repo already knows how to search, open pages, summarize, and draft.

### Goal

- [ ] Research a technical subject currently discussed across the web.
- [ ] Collect primary and secondary sources.
- [ ] Distill the important claims and disagreements.
- [ ] Produce a structured article brief and a draft with citations.

### Ideal workflow

- [ ] Start with a topic such as "browser automation with CDP", "MCP adoption", or "the tradeoffs of local-first AI agents".
- [ ] Search across docs, release notes, blog posts, issue trackers, discussions, and expert commentary.
- [ ] Capture publish date, author, domain, title, and claims.
- [ ] Identify repeated themes, novel insights, and conflicting viewpoints.
- [ ] Build an outline from evidence, not from generic prior knowledge.
- [ ] Generate article sections with linked sources and open questions.
- [ ] Produce a review-ready markdown article package.

### What the current repo can already support

- [x] Query planning
- [x] Search result collection
- [x] Article opening and page digests
- [x] Research summary generation
- [x] Draft generation for lighter content tasks

### What must be added for this workflow to be serious

- [ ] Citation tracking and source metadata
- [ ] Better source quality ranking
- [ ] Primary-source preference rules
- [ ] Multi-pass synthesis instead of one-shot summarization
- [ ] A reusable "article-research" workflow template

## Target Architecture

The simplest scalable shape for this repo is:

### 1. Job layer

- [ ] `Job`: one user request, one budget, one lifecycle
- [ ] `Workflow`: reusable template that defines stages
- [ ] `RunStep`: one execution unit with status, timing, retries, and artifacts

### 2. Research layer

- [ ] `SearchSource`: DuckDuckGo, GitHub, Google Play, docs sites, forums, news, blogs
- [ ] `SearchResult`: normalized search candidate with rank and metadata
- [ ] `FetchedDocument`: raw HTML, text extract, screenshot, checksum, canonical URL
- [ ] `Extraction`: entities, facts, quotes, themes, sentiment, complaints, opportunities

### 3. Storage layer

- [ ] database for jobs, sources, documents, extracted facts, and outputs
- [ ] filesystem artifact store for HTML snapshots, JSON extracts, screenshots, and markdown reports
- [ ] cache invalidation and freshness rules

### 4. Analysis layer

- [ ] deduplication
- [ ] clustering
- [ ] contradiction detection
- [ ] ranking
- [ ] trend scoring
- [ ] evidence-backed summarization

### 5. Output layer

- [ ] report generator
- [ ] markdown brief generator
- [ ] article draft generator
- [ ] opportunity memo generator
- [ ] dataset export

## Proposed CLI Evolution

These commands do not exist yet. They are the direction the product should move toward.

```bash
# Research an Android app niche deeply
npm run start -- workflow run android-opportunity \
  --query "ai study planner" \
  --budget-pages 150 \
  --budget-minutes 90

# Build a technical article research package
npm run start -- workflow run article-research \
  --topic "browser automation with Lightpanda and CDP" \
  --budget-pages 80

# Continue a stopped job
npm run start -- job resume --id 20260320_ab12cd

# Inspect evidence collected for a job
npm run start -- job inspect --id 20260320_ab12cd
```

## Roadmap

This is the execution checklist. Items already present in the repo are marked `[x]`. Planned work remains `[ ]`.

### Phase 0: Preserve And Clarify The Existing Foundation

- [x] Keep the Lightpanda-based CDP automation core
- [x] Keep resumable JSON checkpoints in `.cache/`
- [x] Keep artifact-oriented output under `reports/`
- [ ] Rename "agent" concepts so they describe staged research more explicitly
- [ ] Make README, examples, and CLI help align with the real current behavior
- [ ] Add a single architecture diagram to the docs

### Phase 1: Introduce A Real Job Model

- [x] Add a normalized `Job` model with id, status, timestamps, budget, and workflow type
- [x] Add `RunStep` records for each stage: plan, search, fetch, extract, analyze, write
- [x] Record retry counts, failure reasons, and durations per step
- [ ] Make resume operate at the step level instead of only task-level snapshots
- [ ] Add stable artifact manifests so downstream tools can inspect outputs

### Phase 2: Add Durable Storage

- [x] Introduce SQLite first for local development simplicity
- [x] Add tables for research queries, sources, and documents for agent web research
- [ ] Add tables for jobs, sources, documents, extractions, and outputs
- [ ] Store canonical URL, fetched timestamp, checksum, and source type per document
- [ ] Persist raw HTML or text extracts so results can be re-analyzed without refetching
- [ ] Support upgrading to Postgres later without redesigning the model

### Phase 3: Split Search, Fetch, And Extraction

- [ ] Refactor `agent-runner` into composable pipeline stages
- [ ] Create a search adapter interface
- [ ] Create a fetcher interface
- [ ] Create an extractor interface
- [ ] Create document quality checks for thin pages, blocked pages, and duplicates
- [ ] Add source-specific extraction strategies instead of one generic page digest

### Phase 4: Increase Research Depth Safely

- [ ] Add configurable budgets for pages, time, domains, and parallelism
- [ ] Allow jobs to search and review far more than the current few-result limit
- [ ] Add queue-based processing for large source lists
- [ ] Add per-domain backoff and failure tracking
- [ ] Add domain allowlists and blocklists
- [ ] Add incremental saves after every meaningful state transition

### Phase 5: Build An Evidence Model

- [ ] Extract claims, entities, complaints, feature requests, competitors, and themes
- [ ] Link every extracted item back to source documents
- [ ] Store confidence and extraction method metadata
- [ ] Deduplicate repeated findings across sources
- [ ] Make research summaries cite supporting evidence ids or links

### Phase 6: Improve Analysis Quality

- [ ] Add clustering of sources by topic and intent
- [ ] Add trend scoring from repeated signals across recent sources
- [ ] Add contradiction detection between sources
- [ ] Add source quality scoring with bias toward primary sources when available
- [ ] Add freshness awareness for time-sensitive workflows
- [ ] Add structured synthesis prompts that consume evidence, not raw page dumps

### Phase 7: Productize The First Two Workflows

- [ ] Implement `android-opportunity` workflow template
- [ ] Implement `article-research` workflow template
- [ ] Define workflow inputs, outputs, budgets, and review gates
- [ ] Produce a consistent final folder layout for each workflow
- [ ] Add example reports for both workflows

### Phase 8: Add Interfaces For Real Use

- [ ] Add a local HTTP API for submitting and monitoring jobs
- [ ] Add a minimal dashboard for job status, logs, evidence, and reports
- [ ] Add live streaming logs for long-running runs
- [ ] Add job pause, resume, cancel, and rerun
- [ ] Add workflow presets and saved configurations

### Phase 9: Quality, Testing, And Trust

- [ ] Add unit tests for cache, run-state transitions, and LLM JSON normalization
- [ ] Add fixture-based tests for scraping and extraction logic
- [ ] Add golden-file tests for report generation
- [ ] Add failure-mode tests for blocked pages and empty search results
- [ ] Add prompt versioning and change tracking
- [ ] Add documentation for source reliability and known limitations

## Immediate Build Order

If we start implementation after validating this roadmap, the highest-leverage order is:

- [ ] Create the job and step schema
- [ ] Add SQLite persistence
- [ ] Refactor `agent-runner` into staged pipeline modules
- [ ] Save fetched documents and extracted page records
- [ ] Build the first reusable workflow template: `android-opportunity`
- [ ] Add evidence-backed report generation
- [ ] Add API endpoints and a basic monitor UI

## Definition Of "Amazing" For V1

We should consider the first serious version complete when this repo can do all of the following:

- [ ] Run for 30 to 120 minutes without losing state
- [ ] Collect and store at least 100 useful source pages in one job
- [ ] Reuse previously fetched sources across runs
- [ ] Produce a report whose key conclusions are backed by saved evidence
- [ ] Support at least two polished reusable workflows
- [ ] Resume safely after interruption without restarting from zero
- [ ] Let a user inspect what was searched, what was fetched, what was extracted, and what was concluded

## Current Commands

These are the commands that exist today.

```bash
cp .env.example .env
npm install

# Start Lightpanda
npm run lightpanda:start

# GitHub repository scanning
npm run start -- github \
  --url 'https://github.com/search?q=language%3ATypescript&type=repositories' \
  --pages 10 \
  --criteria 'Interesting repos with unusual engineering depth'

# Google Play market analysis
npm run start -- playstore \
  --query 'gratitude journal' \
  --analyze-top 10

# Lightweight browser research + drafting
npm run start -- agent run \
  "Research cheerful campaign ideas for our product, draft one launch post, and write 5 community comments"
```

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

## Final Notes

- [x] The repo already solves a non-trivial browser automation problem well.
- [x] The next major gain will come from orchestration and storage, not from adding more one-off task scripts.
- [ ] After validating this roadmap, implementation should start with the data model and staged pipeline refactor.
