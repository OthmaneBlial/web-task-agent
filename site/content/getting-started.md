# Getting Started

## 1. See A Real Package Before Configuring Anything

```bash
npm ci
npm run start -- demo list
npm run start -- demo export browser-agent-landscape
```

The bundled demos use checked-in fixtures. They do not call an LLM, open a browser, or request a source. Open `reports/demos/browser-agent-landscape/handoff/workflow-brief.md` first, then inspect its report, evidence file, and manifest.

For a source installation, use Node.js 22 or later. The `install.sh` helper can also create a local launcher; add `--skip-llm-setup` if you only want demos and local commands.

## 2. Configure Environment For Live Research

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

The demo, catalog, pack plan, preview, and scaffold commands do not need a key. Job-launching commands fail immediately with a clear message when no compatible API key is configured.

## 3. Preview A Workflow Before Spending Time Or Tokens

```bash
npm run start -- workflow list --category "Voice of Customer"
npm run start -- workflow preview cybersecurity-voice-of-customer \
  --topic "security review workflow for SaaS teams" \
  --preset focused
```

The preview shows the planned queries, source boundaries, output folder, and preset budget without starting browser or LLM work.

## 4. Run Your First Research Job

### Direct Agent Run

```bash
web-task-agent agent run \
  "Research cheerful launch ideas for our product and write one evidence-backed post"
```

### Workflow Run

```bash
web-task-agent workflow run article-research \
  --topic "browser automation with Lightpanda and CDP" \
  --preset focused
```

If you are learning the system, run the workflow template first. It exercises the same durable pipeline but gives you a more structured output package.

## 4b. Choose A Pack When The Goal Is A Decision

If you need a sequence rather than one workflow, generate a review-gated plan:

```bash
web-task-agent pack list
web-task-agent pack plan validate-an-idea \
  --topic "offline document signing for independent contractors"
```

Packs only write a plan. They never launch a sequence of paid or browser actions without an explicit human review between steps.

## 5. Inspect Outputs

After a run, expect state in these places:

- `.cache/` for resumable local state
- `.data/web-task-agent.sqlite` for durable structured storage
- `reports/` for markdown reports and workflow handoff packages

The quickest way to understand a fresh run is to open the workflow package first, then compare it with the stored job state and the local dashboard.

The main distinction to remember is:

- `.cache/` is for temporary resume state
- `.data/` is for durable job and queue data
- `reports/` is for human-facing outputs

### Suggested First Walkthrough

1. install dependencies
2. start Lightpanda
3. run `workflow run article-research` or export a demo
4. open the resulting report package
5. open the dashboard and compare the visible job state with the files on disk

## 6. Start The Local Dashboard

```bash
web-task-agent server run --port 4317
```

Then open the local management UI at `http://127.0.0.1:4317`.

## First Commands Worth Memorizing

```bash
web-task-agent workflow list
web-task-agent workflow list --search ecommerce
web-task-agent workflow scaffold <new-workflow-id>
web-task-agent queue list
web-task-agent job inspect <job-id>
web-task-agent job report <job-id>
web-task-agent job budget <job-id>
web-task-agent job logs <job-id> --limit 100
web-task-agent storage cleanup --prompt-traces <path>
web-task-agent worker run --once
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
