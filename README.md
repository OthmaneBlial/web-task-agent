# Web Task Agent

CDP-based browser automation for repetitive web research tasks using Lightpanda headless browser and Claude through Z.ai's Anthropic-compatible API.

## What It Does

- Scans GitHub search result pages across pagination and ranks interesting repositories with Claude.
- Scrapes Google Play search results, opens app detail pages, and generates market insight reports.
- Plans higher-level agent jobs from a single instruction, does lightweight browser research, drafts content, and produces a review-ready report.
- Connects to a Lightpanda headless browser via CDP instead of Chrome.
- **Evades Captchas & Bot Detection**: Combines DuckDuckGo HTML Lite (captcha-free organic search) with a flattened CDP proxy session that bypasses Chrome-specific HTTP fingerprinting constraints.
- Saves incremental task state to `.cache/` so runs can resume.

## Requirements

- Node.js 20+
- curl (for downloading Lightpanda binary)
- A working Z.ai Anthropic-compatible API key

## Setup

```bash
cd /home/othmane/Downloads/automation/web-task-agent
cp .env.example .env
npm install
```

`.env.example` uses these variables:

```env
CDP_PORT=9222
LIGHTPANDA_DISABLE_TELEMETRY=true
ANTHROPIC_API_KEY=your_zai_key_here
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_TIMEOUT_MS=90000
```

## Start Lightpanda

The agent uses [Lightpanda](https://github.com/lightpanda-io/browser), a headless browser built from scratch for AI agents and automation. It is 11× faster than Chrome and uses 9× less memory.

```bash
cd /home/othmane/Downloads/automation/web-task-agent

# Start the Lightpanda CDP server (auto-downloads binary on first run)
npm run lightpanda:start

# Check it's running
curl -s http://127.0.0.1:9222/json/version

# Stop when done
npm run lightpanda:stop

# Update to latest nightly
npm run lightpanda:update
```

The start script automatically downloads the correct nightly binary for your platform (Linux x86_64 or macOS aarch64) on first run. It will also detect and kill any stalled Chrome or Chromium background processes illegally occupying port 9222 before starting Lightpanda.

## ⚡ The Anti-Bot Architecture

This agent uses a highly specialized architecture to guarantee long-running web tasks do not get blocked by "Solve this puzzle" pages (Cloudflare, PerimeterX, etc.):

### 1. Lightpanda Headless Engine
Unlike headless Chrome (which leaks easily-fingerprinted visual rendering flags), Lightpanda is a ground-up headless execution engine that doesn't render pixels. Therefore, sites that rely on visual DOM challenges simply cannot serve them. It uses 9× less memory than Chrome, allowing long-running deep research.

### 2. DuckDuckGo HTML Lite Intelligence
Rather than fighting Bing or Google captchas, the agent explicitly routes all research queries through `html.duckduckgo.com`. DuckDuckGo's Lite version serves pure HTML without executing anti-bot scripts. The agent intercepts and parses the raw DOM, bypassing Javascript challenges entirely.

### 3. Flat Session CDP Proxy
Standard browser automation libraries (like `chrome-remote-interface` or Puppeteer) crash when attaching to Lightpanda because they request HTTP endpoints (`/json/new`) that don't exist in Lightpanda's single-WebSocket design. This agent implements a custom proxy in `src/lib/cdp.ts` that hijacks `Target.attachToTarget({ flatten: true })` and injects session IDs into all raw CDP commands, bypassing HTTP discovery entirely.

## GitHub Example

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run lightpanda:start
npm run start -- github --url 'https://github.com/search?q=language%3AC+stars%3A%3C500&type=repositories' --pages 30 --criteria 'Hidden gems with less than 500 stars that do low level systems programming'
```

## Google Play Example

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run lightpanda:start
npm run start -- playstore --query 'gratitude journal' --analyze-top 10
```

## Resume A Previous Run

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run lightpanda:start
npm run start -- github --url 'https://github.com/search?q=language%3AC+stars%3A%3C500&type=repositories' --pages 30 --criteria 'Hidden gems with less than 500 stars that do low level systems programming' --resume

npm run start -- playstore --query 'gratitude journal' --analyze-top 10 --resume
```

## Agent Example

```bash
cd /home/othmane/Downloads/automation/web-task-agent
npm run lightpanda:start
npm run start -- agent run "Research cheerful campaign ideas for our product, draft one bright launch post, write 5 friendly community comments, and wait for my review"
```

Expected end-of-run output shape:

```text
[timestamp] attached to Lightpanda CDP server
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

For research runs, the agent behaves like a real person:

- It spends a few seconds scanning the search results page.
- It keeps a useful article open for 10-20 seconds with staggered scrolling.
- It closes thin, broken, or error-like pages quickly and moves on.

## Output Locations

- Cache files: `.cache/`
- Reports: `reports/`
- Failure screenshots: `/tmp/playstore-failure-*.png`, `/tmp/playstore-detail-failure-*.png`, `/tmp/github-*.png`

## Notes

- Lightpanda is a headless-only browser with no graphical rendering, so it avoids visual challenges and captchas that plague headless Chrome.
- The `agent-runner` explicitly utilizes DuckDuckGo HTML Lite instead of standard search engines to ensure maximum reliability and prevent IP blocking.
- Google Play keeps some background requests open for long periods, so the task uses selector-based readiness checks plus soft network-idle waits instead of blocking forever on strict idle.
- The Anthropic SDK is still used, but requests are sent to Z.ai through `ANTHROPIC_BASE_URL` with `ANTHROPIC_API_KEY`.
