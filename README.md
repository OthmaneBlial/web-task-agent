# Web Task Agent

CDP-based browser automation for repetitive web research tasks using a real Chrome profile and Claude through Z.ai's Anthropic-compatible API.

## What It Does

- Scans GitHub search result pages across pagination and ranks interesting repositories with Claude.
- Scrapes Google Play search results, opens app detail pages in human-like flows, and generates market insight reports.
- Plans higher-level agent jobs from a single instruction, does lightweight browser research, drafts content, and produces a review-ready report.
- Attaches to an already running Chrome debugger session instead of using Puppeteer or Playwright.
- Saves incremental task state to `.cache/` so runs can resume.

## Requirements

- Node.js 20+
- Chrome or Chromium with remote debugging enabled
- A working Z.ai Anthropic-compatible API key

## Setup

```bash
cd /home/othmane/Downloads/automation/web-task-agent
cp .env.example .env
npm install
```

`.env.example` uses these variables:

```env
CHROME_PORT=9222
ANTHROPIC_API_KEY=your_zai_key_here
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_TIMEOUT_MS=90000
```

## Start Chrome First

You can start Chrome in visible mode or headless mode. Both use the same CDP automation path, so the tasks themselves do not change.

Visible mode:

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
curl -s http://127.0.0.1:9222/json/version
```

Headless mode:

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start:headless
curl -s http://127.0.0.1:9222/json/version
```

If the `curl` command returns browser JSON, the debugger is ready.

You can also use `CHROME_HEADLESS=1 npm run chrome:start`.

When a headless search results page gets challenged by the provider, the agent falls back to a normal RSS search feed for link discovery, then still opens and reads the article pages in Chrome.

## GitHub Example

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
npm run start -- github --url 'https://github.com/search?q=language%3AC+stars%3A%3C500&type=repositories' --pages 30 --criteria 'Hidden gems with less than 500 stars that do low level systems programming'
```

## Google Play Example

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
npm run start -- playstore --query 'gratitude journal' --analyze-top 10
```

## Resume A Previous Run

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
npm run start -- github --url 'https://github.com/search?q=language%3AC+stars%3A%3C500&type=repositories' --pages 30 --criteria 'Hidden gems with less than 500 stars that do low level systems programming' --resume

npm run start -- playstore --query 'gratitude journal' --analyze-top 10 --resume
```

## Agent Example

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
npm run start -- agent run "Research cheerful campaign ideas for our product, draft one bright launch post, write 5 friendly community comments, and wait for my review"
```

Expected end-of-run output shape:

```text
[timestamp] attached to Chrome debugger session
[timestamp] researching: cheerful marketing campaign examples
[timestamp] scanning results for "..." for about 6s
[timestamp] opening article: ...
[timestamp] reading article: ... for about 14s
Agent job update.
Status: waiting_review
Estimated time: 4 minutes
Cache: /home/othmane/Downloads/automation/web-task-agent/.cache/agent_run_<id>.json
Report: /home/othmane/Downloads/automation/web-task-agent/reports/agent-job-<id>/report.md
Artifacts: /home/othmane/Downloads/automation/web-task-agent/reports/agent-job-<id>
```

If you paste a quoted instruction across multiple lines, your shell can insert a real newline into the text. The CLI now normalizes extra whitespace, but it is still better to keep the instruction on one line.

For research runs, the agent now behaves more like a real person:

- It spends a few seconds scanning the search results page.
- It keeps a useful article open for 10-20 seconds with staggered scrolling.
- It closes thin, broken, or error-like pages quickly and moves on.

## Real Run Smoke Tests

These are the exact real runs validated against a live Chrome session.

### 1. Play Store smoke test

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
npm run start -- playstore --query 'gratitude journal' --analyze-top 1 --report /tmp/playstore-smoke-report.md
```

Expected successful end-of-run output shape:

```text
[timestamp] analyzed Routine Planner, Habit Tracker
Play Store analysis complete.
Cache: /home/othmane/Downloads/automation/web-task-agent/.cache/playstore_run_<id>.json
Report: /tmp/playstore-smoke-report.md
Search results found: 30
Apps analyzed: 1
```

### 2. Chrome debugger check

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
curl -s http://127.0.0.1:9222/json/version
curl -s http://127.0.0.1:9222/json/list | head
```

### 3. Full Play Store run

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
npm run start -- playstore --query 'gratitude journal' --analyze-top 10
```

### 4. Full GitHub run

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run chrome:start
npm run start -- github --url 'https://github.com/search?q=language%3AC+stars%3A%3C500&type=repositories' --pages 30 --criteria 'Hidden gems with less than 500 stars that do low level systems programming'
```

## Output Locations

- Cache files: `.cache/`
- Reports: `reports/`
- Failure screenshots: `/tmp/playstore-failure-*.png`, `/tmp/playstore-detail-failure-*.png`, `/tmp/github-*.png`

## Notes

- Google Play keeps some background requests open for long periods, so the task uses selector-based readiness checks plus soft network-idle waits instead of blocking forever on strict idle.
- Detail pages are opened with human-like modified clicks from the search results page.
- The Anthropic SDK is still used, but requests are sent to Z.ai through `ANTHROPIC_BASE_URL` with `ANTHROPIC_API_KEY`.
