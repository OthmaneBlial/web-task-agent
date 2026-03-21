# Getting Started

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

Create or update your `.env` file with the variables used by the project:

```env
CDP_PORT=9222
LIGHTPANDA_DISABLE_TELEMETRY=true
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_TIMEOUT_MS=90000
WEB_TASK_AGENT_DB_PATH=.data/web-task-agent.sqlite
```

## 3. Start Lightpanda

```bash
npm run lightpanda:start
```

The agent relies on a CDP server, and the repo is currently designed around Lightpanda.

## 4. Run Your First Research Job

### Direct Agent Run

```bash
npm run start -- agent run \
  "Research cheerful launch ideas for our product and write one evidence-backed post"
```

### Workflow Run

```bash
npm run start -- workflow run article-research \
  --topic "browser automation with Lightpanda and CDP"
```

## 5. Inspect Outputs

After a run, expect state in these places:

- `.cache/` for resumable local state
- `.data/web-task-agent.sqlite` for durable structured storage
- `reports/` for markdown reports and workflow handoff packages

## 6. Start The Local Dashboard

```bash
npm run start -- server run --port 4317
```

Then open the local management UI at `http://127.0.0.1:4317`.

## First Commands Worth Memorizing

```bash
npm run start -- workflow list
npm run start -- queue list
npm run start -- job logs <job-id> --limit 100
npm run start -- worker run --once
```

## Where Workflow Packages Land

A workflow run typically writes a package shaped like this:

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
