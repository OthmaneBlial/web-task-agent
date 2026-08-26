# Web Task Agent

[![CI](https://github.com/OthmaneBlial/web-task-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/OthmaneBlial/web-task-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Turn a messy web question into a local, evidence-backed decision package.**

Web Task Agent is a local-first research runner for work that needs more than a chat answer: durable jobs, source snapshots, evidence clusters, contradictions, resumability, queue workers, and a handoff a teammate can actually inspect.

It is not a hosted scraper, an access-control bypass tool, or a generic browser-agent framework. Its job is to preserve the trail from a recommendation back to the evidence that supports — or challenges — it.

## See a package before configuring anything

The bundled demos have no API key, browser session, or network request. They show the exact report, evidence, and handoff shape a live workflow produces.

```bash
curl -fsSL https://raw.githubusercontent.com/OthmaneBlial/web-task-agent/main/install.sh \
  | bash -s -- --skip-llm-setup

web-task-agent demo export browser-agent-landscape
open reports/demos/browser-agent-landscape/handoff/workflow-brief.md
```

The package contains:

- `handoff/workflow-brief.md` — the decision-ready reading start.
- `report.md` — findings, uncertainty, and the next validation.
- `evidence/sources.json` — the source trail with role and collection date.
- `package-manifest.json` — an explicit, versioned file contract.

Try the other deterministic demos with `web-task-agent demo list`. They are fixtures, clearly marked as such; they do not pretend to be fresh live research.

Read all three versioned [research receipts](RESEARCH_RECEIPTS.md) directly in the repository.

## Run live research

Set a narrow, compatible API key in `.env`, then choose a workflow and a topic:

```bash
web-task-agent workflow list --category "Voice of Customer"

web-task-agent workflow run cybersecurity-voice-of-customer \
  --topic "security review workflow for SaaS teams" \
  --audience "product and security leads" \
  --preset focused
```

For the complete workflow catalog:

```bash
web-task-agent workflow list --search ecommerce
web-task-agent workflow list --category "Pricing and Packaging"
```

There are three focused core workflows plus 240 executable catalog workflows. Browse them in [examples/workflows/CATALOG.md](examples/workflows/CATALOG.md).

## Why this instead of a crawler or generic browser agent?

Browser automation and extraction are necessary infrastructure. Web Task Agent adds the operator-facing research contract:

| Need | Web Task Agent behavior |
| --- | --- |
| A job survives a crash | Durable SQLite state, leases, heartbeats, queue recovery, and stage resume |
| A recommendation is inspectable | Sources, snapshots, evidence clusters, citations, quality signals, and contradictions remain attached |
| A report is useful outside the terminal | Stable workflow package with brief, report, raw research, plan, drafts, manifest, and prompt trace |
| Work stays understandable on one machine | Local CLI, local dashboard, local storage, explicit output paths, and no required hosted control plane |
| A workflow is reusable | Presets, catalog metadata, topic-scoped output paths, examples, and deterministic package fixtures |

Use a crawler or a browser agent when you only need page control or extraction. Use Web Task Agent when the result needs to remain reviewable, resumable, and decision-ready.

## Catalog families

Each catalog entry carries a distinct decision focus, source strategy, query set, expected deliverables, output package and example. They are grouped by the decision to make:

- Voice of customer and feature-gap discovery
- Competitor mapping and market entry
- Pricing, packaging, segments, and buyer journey
- Launch positioning and content demand
- Integrations and partnerships
- Product validation, retention, and churn

The same decision families are available across AI developer tools, API platforms, DevOps, security, data, B2B SaaS, e-commerce, fintech, HR, education, wellness, creators, marketplaces, real estate, local business, sustainability, productivity, travel, and mobile apps.

## Operator controls

```bash
web-task-agent pack plan validate-an-idea --topic "local research assistant" --dry-run
web-task-agent workflow enqueue market-opportunity --topic "offline PDF tools"
web-task-agent worker run --once
web-task-agent queue list
web-task-agent job inspect <job-id>
web-task-agent job report <job-id>
web-task-agent job logs <job-id> --limit 100
web-task-agent job budget <job-id>
web-task-agent job export <job-id> --format markdown --redact --dry-run
web-task-agent job compare <earlier-job-id> <later-job-id> --redact --dry-run
web-task-agent storage gate
web-task-agent storage backup --output ./web-task-agent-backup.sqlite
web-task-agent server run --port 4317
```

`pack plan --dry-run` prints its report destinations plus aggregate query, candidate, and runtime bounds without writing a plan or launching a browser/LLM step. The bounds are deliberately not a price estimate: actual usage depends on the selected sources and model.

The dashboard is local at `http://127.0.0.1:4317`. Runtime data is kept outside the code tree:

- `.cache/` — resumable work state.
- `.data/web-task-agent.sqlite` — durable jobs, queue data, source/evidence metadata, and artifacts.
- `reports/` — human-facing packages.

Use `storage backup --output <path>` for a consistent local SQLite snapshot. `storage restore --input <path> --force` always writes a safety backup of the database it replaces.

## Safety and privacy

- Browser pages, search snippets, files, and LLM output are untrusted input.
- Do not use the project to bypass access controls, solve CAPTCHAs, or automate high-risk external actions.
- A local workflow can still send selected content to the LLM endpoint configured by the operator. Use the narrowest credentials possible.
- Never commit API keys, cookies, private reports, runtime databases, or prompt traces.
- Use `job export --dry-run --redact` before sharing. It previews the local package, recognizes common secret formats, and writes nothing or sends nothing unless you explicitly choose an output file.
- Direct source acquisition checks configured domain boundaries, public `robots.txt` rules when available, paces repeated domains, and quarantines unsafe redirect targets; it never bypasses access controls.

Read [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and [SUPPORT.md](SUPPORT.md) before running sensitive work or reporting a vulnerability.

## Develop and verify

```bash
npm ci
npm test
npm run generate:workflows
npm run release:check
npm run build
```

`npm test` runs deterministic fixtures for the standard CI path: it does not require an API key or live Play Store/AppBrain pages. Live research remains an operator-invoked command, never a hidden test dependency.

`npm run release:check` adds the production dependency audit and a dry-run of the npm package. Follow [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before any public release or visibility change.

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then read the [workflow catalog](examples/workflows/CATALOG.md). A useful workflow contribution has a repeated decision, a distinct source strategy, a stable evidence-backed output, a safety boundary, and a test/fixture — not just a renamed prompt.

## Documentation

- [Platform](docs/content/platform.md)
- [Getting started](docs/content/getting-started.md)
- [CLI reference](docs/content/cli-reference.md)
- [Workflow catalog](examples/workflows/CATALOG.md)
- [Example research receipts](examples/receipts/)
- [Research receipts guide](RESEARCH_RECEIPTS.md)
- [Roadmap](ROADMAP.md)
- [Release checklist](RELEASE_CHECKLIST.md)
- [Security policy](SECURITY.md)
