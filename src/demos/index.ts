import fs from "node:fs";
import path from "node:path";

import {
  buildFixtureDecisionReceipt,
  writeReceiptIntegrityManifest
} from "../lib/receipt";

export interface DemoFixture {
  id: string;
  title: string;
  description: string;
  scenario: string;
  report: string;
  workflowBrief: string;
  sources: Array<{
    title: string;
    url: string;
    publisher: string;
    accessedAt: string;
    role: string;
  }>;
}

export interface WrittenDemoPackage {
  outputDir: string;
  reportPath: string;
  workflowBriefPath: string;
  sourcesPath: string;
  manifestPath: string;
  receiptPath: string;
  receiptJsonPath: string;
  integrityManifestPath: string;
}

const FIXTURE_DATE = "2026-08-26";

const DEMOS: DemoFixture[] = [
  {
    id: "browser-agent-landscape",
    title: "Browser Agent Landscape",
    description: "A technical research package that keeps competitive claims, boundaries, and source links together.",
    scenario: "Compare the current public positioning of browser automation, web extraction, and durable agent execution tools.",
    report: `# Browser Agent Landscape\n\n## Decision\n\nPosition Web Task Agent around local, evidence-backed decision packages rather than generic browser control or crawling.\n\n## What the evidence supports\n\n- Browser Use publicly positions natural-language web automation across extraction, multi-step workflows, research, monitoring, testing, and scheduling.\n- Firecrawl distinguishes web-wide agent discovery from known-URL scraping and structured extraction.\n- LangChain's Deep Agents documentation presents durable execution and human-in-the-loop control as core building blocks for complex agent work.\n\n## Product implication\n\nBrowser control and discovery are necessary infrastructure, not a distinctive product claim. A credible Web Task Agent message must make the retained source trail, contradictions, local state, recovery, and decision-ready handoff visible.\n\n## What could invalidate this\n\n- A competing product could expose an equally usable local evidence graph and resumable decision package.\n- Operators could value speed over auditability for the target use cases. Validate this with three real operator runs before making a broad market claim.\n\n## Next validation\n\nRun the article-research workflow on a current agent topic, then ask an operator whether they can trace every recommendation to a source without opening the database.`,
    workflowBrief: `# Technical Research Brief\n\n## Story thesis\n\nThe browser-agent category is crowded at the execution layer. Durable local evidence and a decision-ready handoff are the narrower, more defensible product surface.\n\n## Claim checklist\n\n- Verify current product claims against the linked official documentation.\n- Do not claim benchmark superiority from this fixture.\n- Treat the conclusion as a positioning hypothesis until verified by operator interviews.`,
    sources: [
      { title: "Browser Use introduction", url: "https://docs.browser-use.com/cloud/agent/quickstart", publisher: "Browser Use", accessedAt: FIXTURE_DATE, role: "browser-agent capability reference" },
      { title: "Choosing the Data Extractor", url: "https://docs.firecrawl.dev/developer-guides/usage-guides/choosing-the-data-extractor", publisher: "Firecrawl", accessedAt: FIXTURE_DATE, role: "web discovery and extraction reference" },
      { title: "Deep Agents overview", url: "https://docs.langchain.com/oss/python/deepagents/overview", publisher: "LangChain", accessedAt: FIXTURE_DATE, role: "durable execution and review reference" }
    ]
  },
  {
    id: "workflow-quality-audit",
    title: "Workflow Quality Audit",
    description: "A deterministic package showing how to evaluate whether a proposed workflow deserves to enter the catalog.",
    scenario: "Review a proposed research workflow for a repeated decision, a distinct source strategy, an explicit output contract, and disconfirming evidence.",
    report: `# Workflow Quality Audit\n\n## Decision\n\nAccept a workflow only when it addresses a repeated operator decision and produces a stable evidence-backed handoff.\n\n## Evaluation rubric\n\n1. **Decision:** the operator can name the decision this workflow improves.\n2. **Evidence:** sources are suitable, accessible, and not all marketing material.\n3. **Distinctness:** queries and deliverables are not a renamed copy of an existing workflow.\n4. **Handoff:** the output names the recommendation, source trail, uncertainty, contradictions, and smallest next test.\n5. **Safety:** the workflow declares source restrictions, data risks, and human review points.\n\n## Rejection examples\n\n- A prompt that only changes the target industry but preserves the same decision and query strategy.\n- A workflow that turns unverified search snippets into a recommendation.\n- A workflow whose output cannot be inspected after an interrupted run.\n\n## Next validation\n\nUse this rubric against a contributor proposal and record the reviewer decision in the pull request.`,
    workflowBrief: `# Workflow Review Brief\n\n## Required outcome\n\nA reviewer should be able to approve, request evidence, or reject the proposal without guessing its intended decision or source policy.\n\n## Checklist\n\n- Is the user decision concrete?\n- Are source and safety boundaries declared?\n- Does the package keep citations and contradictions?\n- Is there a deterministic test or fixture?`,
    sources: [
      { title: "Web Task Agent workflow contribution guidance", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/CONTRIBUTING.md", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "contribution contract" },
      { title: "Web Task Agent workflow catalog", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/examples/workflows/CATALOG.md", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "existing workflow comparison" },
      { title: "Web Task Agent workflow proposal form", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/.github/ISSUE_TEMPLATE/workflow-proposal.yml", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "review intake contract" }
    ]
  },
  {
    id: "local-first-risk-review",
    title: "Local-First Risk Review",
    description: "A security-oriented package showing the operator controls that surround browser and LLM research.",
    scenario: "Review a local research run for unsafe targets, secret exposure, source manipulation, and unsafe sharing before treating its output as ready.",
    report: `# Local-First Risk Review\n\n## Decision\n\nTreat browser pages, search snippets, files, and LLM responses as untrusted inputs. Keep operator approval at the boundary where data leaves the machine or a sensitive action could occur.\n\n## Required controls\n\n- Reject private-network and credential-bearing URLs before fetch.\n- Respect declared source policy and do not bypass access controls or CAPTCHAs.\n- Detect instructions embedded in web content and keep them separate from the operator's task.\n- Redact secrets from persisted logs, reports, and prompt traces.\n- Preview and redact exports before sharing a package.\n\n## Residual risk\n\nLocal-first does not mean offline: selected content may be sent to the configured LLM endpoint. The operator must understand and approve that boundary.\n\n## Next validation\n\nRun source-policy and redaction tests for every new fetcher, output writer, and provider adapter.`,
    workflowBrief: `# Security Review Brief\n\n## Outcome\n\nThe run is ready only if policy decisions, source limits, and redaction behavior are visible to the operator.\n\n## Review questions\n\n- Could this URL reach a private service?\n- Could page text override the operator instruction?\n- Could a secret appear in a trace or export?\n- Does the user know what data leaves the device?`,
    sources: [
      { title: "OWASP Top 10 for LLM Applications", url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/", publisher: "OWASP", accessedAt: FIXTURE_DATE, role: "prompt-injection and data-handling reference" },
      { title: "Web Task Agent security policy", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/SECURITY.md", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "project security boundary" },
      { title: "Web Task Agent privacy contract", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/PRIVACY.md", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "local-data boundary" }
    ]
  },
  {
    id: "product-launch-readiness",
    title: "Product Launch Readiness",
    description: "A launch package that separates publishable proof from claims that still need validation.",
    scenario: "Prepare a public release for a developer tool by checking the experience a visitor can verify, the claims that are supported, and the next evidence to collect.",
    report: `# Product Launch Readiness

## Decision

Publish a launch only when a new visitor can reproduce the promised first result, inspect the release, and find a clear boundary around what has not been tested.

## What the evidence supports

- A release page makes a versioned change set and its target commit inspectable.
- A project site and README should point to the same installation path and first useful result.
- Community feedback is more useful when it asks for a concrete decision, first-run experience, or missing evidence instead of general praise.

## What could invalidate this

- The installation or demo path could fail on a clean machine.
- A release claim could drift from the source repository or documentation site.
- Feedback may reveal that the retained package is not more useful than a simpler research note.

## Next validation

Run the deterministic demo on a clean machine, open the published release and site, then ask three target operators which artifact they inspected first and what they still could not verify.`,
    workflowBrief: `# Launch Readiness Brief

## Story thesis

The launch asset is not a claim sheet. It is a short path from a public promise to a versioned release, a deterministic first result, and a clear request for disconfirming feedback.

## Claim checklist

- Can a visitor reach a public release and the project site?
- Does the README give a first result before credentials are needed?
- Does every adoption claim have a linked artifact or an explicit limit?
- Is the feedback request specific enough to produce an actionable issue or Discussion?`,
    sources: [
      { title: "About releases", url: "https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases", publisher: "GitHub Docs", accessedAt: FIXTURE_DATE, role: "versioned release reference" },
      { title: "SEO Starter Guide", url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide", publisher: "Google Search Central", accessedAt: FIXTURE_DATE, role: "public discoverability reference" },
      { title: "Web Task Agent v0.2.0", url: "https://github.com/OthmaneBlial/web-task-agent/releases/tag/v0.2.0", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "project release artifact" }
    ]
  },
  {
    id: "competitor-decision-map",
    title: "Competitor Decision Map",
    description: "A comparison package that keeps category boundaries, source links, and differentiation hypotheses together.",
    scenario: "Decide how to position a research product alongside browser automation, web extraction, and durable agent frameworks without claiming unverified superiority.",
    report: `# Competitor Decision Map

## Decision

Position a product by the operator decision and retained artifact it improves, not by copying a competitor feature list.

## What the evidence supports

- Browser automation, extraction, and durable agent execution solve overlapping but different operator problems.
- Primary product documentation is the right starting point for capability claims; third-party comparison pages are not sufficient proof on their own.
- A local evidence trail, contradiction handling, and resumable decision package are a narrower claim than generic web control.

## What could invalidate this

- A competing tool may already provide an equally usable local source trail and handoff.
- Operators may prefer speed or hosted collaboration to local inspectability.
- The comparison may become stale as product documentation changes.

## Next validation

Re-check the linked primary documentation, choose one operator decision, and compare the artifacts produced by each approach rather than only their feature lists.`,
    workflowBrief: `# Competitor Research Brief

## Required outcome

The comparison should show a concrete decision, the primary sources behind each claim, and a hypothesis that can be disproved by an operator trial.

## Review questions

- Which job is each tool optimized to complete?
- Which facts come from primary documentation?
- What artifact remains after a run is interrupted?
- Which difference is a hypothesis rather than a verified fact?`,
    sources: [
      { title: "Browser Use introduction", url: "https://docs.browser-use.com/cloud/agent/quickstart", publisher: "Browser Use", accessedAt: FIXTURE_DATE, role: "browser automation capability reference" },
      { title: "Choosing the Data Extractor", url: "https://docs.firecrawl.dev/developer-guides/usage-guides/choosing-the-data-extractor", publisher: "Firecrawl", accessedAt: FIXTURE_DATE, role: "web extraction capability reference" },
      { title: "Deep Agents overview", url: "https://docs.langchain.com/oss/python/deepagents/overview", publisher: "LangChain", accessedAt: FIXTURE_DATE, role: "durable agent execution reference" }
    ]
  },
  {
    id: "github-issue-opportunity",
    title: "GitHub Issue Opportunity",
    description: "A repository-feedback package that distinguishes reproducible bugs, workflow ideas, and evidence gaps.",
    scenario: "Review public GitHub feedback to decide whether it is a reproducible issue, a workflow proposal, a request for evidence, or a broader community discussion.",
    report: `# GitHub Issue Opportunity

## Decision

Route incoming repository feedback to the smallest public space that preserves its evidence and makes review expectations clear.

## What the evidence supports

- Issues work best for reproducible bugs and focused implementation changes.
- Labels make review state visible without turning a request into a promise.
- Discussions are a better home for workflow ideas, receipts, and questions that need exploration before an actionable issue exists.

## What could invalidate this

- A contributor may need a lightweight issue before they can produce a full workflow proposal.
- Labels can become noise if maintainers do not apply them consistently.
- A public thread can omit the source links or minimal reproduction needed for a decision.

## Next validation

Take three incoming requests, route them using the documented rules, and ask the authors whether the expected next step was clear within five minutes.`,
    workflowBrief: `# Repository Feedback Brief

## Outcome

A maintainer can explain where feedback belongs, what proof is needed next, and whether the request has enough evidence to become implementation work.

## Triage checklist

- Is there a minimal reproduction or a concrete decision?
- Does the request need source evidence or a deterministic fixture?
- Is an Issue, Discussion, or workflow proposal the smallest useful home?
- Which label makes the review state visible without overstating commitment?`,
    sources: [
      { title: "About issues", url: "https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/about-issues", publisher: "GitHub Docs", accessedAt: FIXTURE_DATE, role: "issue-tracking reference" },
      { title: "Managing labels", url: "https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels", publisher: "GitHub Docs", accessedAt: FIXTURE_DATE, role: "review-state reference" },
      { title: "About discussions", url: "https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions", publisher: "GitHub Docs", accessedAt: FIXTURE_DATE, role: "community discussion reference" }
    ]
  },
  {
    id: "technical-article-brief",
    title: "Technical Article Brief",
    description: "A technical-writing package that keeps primary documentation, uncertainty, and a claim checklist together.",
    scenario: "Prepare an article about browser automation and local research infrastructure without flattening implementation trade-offs into unsupported claims.",
    report: `# Technical Article Brief

## Decision

Write a technical article only after the implementation claims, caveats, and source links can survive a reader opening the cited documentation.

## What the evidence supports

- Protocol-level browser tooling exposes a concrete automation boundary that should be documented rather than implied.
- A lighter browser runtime changes operational trade-offs; compatibility and feature limits must remain visible.
- Article conclusions should distinguish documented behavior from an author's interpretation and operator experience.

## What could invalidate this

- The protocol or runtime documentation could change before publication.
- A claim that works in one local configuration may fail in another.
- A source can explain an API without proving a broader performance or reliability conclusion.

## Next validation

Re-run every command from the draft, reopen each primary source, and have a technical reviewer mark claims that need a narrower scope or a reproducible example.`,
    workflowBrief: `# Technical Writing Brief

## Required outcome

The eventual article should give readers a claim checklist, a reproducible path, linked primary sources, and explicit uncertainty around compatibility or performance.

## Claim checklist

- Is the implementation claim tied to a primary source or a checked command?
- Are compatibility and runtime limits named?
- Does the draft distinguish source fact from interpretation?
- What would a reviewer need to reproduce or reject the conclusion?`,
    sources: [
      { title: "Chrome DevTools Protocol", url: "https://chromedevtools.github.io/devtools-protocol/", publisher: "Chrome DevTools", accessedAt: FIXTURE_DATE, role: "browser protocol reference" },
      { title: "Lightpanda documentation", url: "https://lightpanda.io/docs/", publisher: "Lightpanda", accessedAt: FIXTURE_DATE, role: "browser runtime reference" },
      { title: "Web Task Agent article-research workflow", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/docs/content/example-article-research.md", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "project workflow reference" }
    ]
  },
  {
    id: "app-review-opportunity",
    title: "App Review Opportunity",
    description: "An app-research package that turns public review patterns into a falsifiable opportunity brief.",
    scenario: "Assess whether recurring public app-review complaints point to a product opportunity, a usability issue, or a claim that needs direct user validation.",
    report: `# App Review Opportunity

## Decision

Treat app reviews as discovery evidence for repeated pains and workarounds, then validate the proposed opportunity before committing to a product direction.

## What the evidence supports

- Review feedback can reveal repeated language, friction, and missing expectations that are worth clustering.
- Quality guidance is useful for separating a broad platform expectation from a product-specific gap.
- An opportunity brief needs contradictory evidence and a smallest validation, not only a list of complaints.

## What could invalidate this

- Reviews may be old, unrepresentative, manipulated, or about a resolved version.
- A recurring complaint may be caused by onboarding, policy, pricing, or device compatibility rather than a missing feature.
- A large review count does not prove willingness to switch or pay.

## Next validation

Collect fresh reviews with dates and app versions, compare against release notes and official product behavior, then test one narrow problem statement with target users.`,
    workflowBrief: `# App Opportunity Brief

## Outcome

The package should preserve the review language, source date, counterexamples, and a validation experiment before anyone turns a complaint cluster into a roadmap item.

## Review questions

- Are the sources public, dated, and tied to a specific product context?
- What alternative explanation could produce the same complaint?
- Which quality expectation is general and which gap is product-specific?
- What small user test would falsify the opportunity?`,
    sources: [
      { title: "Android app quality", url: "https://developer.android.com/quality", publisher: "Android Developers", accessedAt: FIXTURE_DATE, role: "platform quality reference" },
      { title: "View and analyze your app's ratings and reviews", url: "https://support.google.com/googleplay/android-developer/answer/138230?hl=en", publisher: "Google Play Console Help", accessedAt: FIXTURE_DATE, role: "review-system reference" },
      { title: "Web Task Agent Android opportunity example", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/docs/content/example-android-opportunity.md", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "project workflow reference" }
    ]
  }
];

function findDemo(id: string): DemoFixture {
  const demo = DEMOS.find((candidate) => candidate.id === id);
  if (!demo) {
    throw new Error(`unknown demo: ${id}. Run \"web-task-agent demo list\" to see available demos.`);
  }
  return demo;
}

function writeFile(destination: string, content: string, force: boolean): void {
  if (fs.existsSync(destination) && !force) {
    throw new Error(`refusing to overwrite ${destination}; pass --force to replace this demo package.`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, "utf8");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeExternalUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "#";
  } catch {
    return "#";
  }
}

function readMarkdownSection(markdown: string, title: string): string {
  const heading = `## ${title}`;
  const start = markdown.indexOf(heading);
  if (start < 0) return "";
  const contentStart = start + heading.length;
  const nextHeading = markdown.indexOf("\n## ", contentStart);
  return markdown.slice(contentStart, nextHeading < 0 ? undefined : nextHeading).trim();
}

function renderMarkdownFragment(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    output.push(`<ul>${bullets.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    bullets = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    const escaped = escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (line.startsWith("- ")) {
      bullets.push(escapeHtml(line.slice(2)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"));
      continue;
    }
    flushBullets();
    output.push(`<p>${escaped}</p>`);
  }
  flushBullets();
  return output.join("");
}

/**
 * A portable, local-only receipt for the fastest product demonstration. It is
 * deliberately a standalone HTML file: no network, scripts, analytics, or
 * mutable live data are needed to inspect and share the decision package.
 */
export function renderDemoReceiptHtml(demo: DemoFixture): string {
  const decision = readMarkdownSection(demo.report, "Decision");
  const findings = readMarkdownSection(demo.report, "What the evidence supports");
  const contradictions = readMarkdownSection(demo.report, "What could invalidate this");
  const nextValidation = readMarkdownSection(demo.report, "Next validation");
  const sourceCards = demo.sources.map((source) => {
    const href = escapeHtml(safeExternalUrl(source.url));
    return `<li class="source-card"><span class="source-role">${escapeHtml(source.role)}</span><a href="${href}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.title)}</a><span>${escapeHtml(source.publisher)} · accessed ${escapeHtml(source.accessedAt)}</span></li>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(demo.title)} — Decision Receipt</title>
  <style>
    :root { --ink: #1b1714; --muted: #6d6259; --paper: #fffaf2; --ground: #efe6d8; --line: #e1d5c2; --accent: #0f766e; --accent-soft: #ddf1ec; --warn: #9a3412; --warn-soft: #fff0e6; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; color: var(--ink); background: radial-gradient(circle at 84% 0%, #d8eee8 0, transparent 25rem), var(--ground); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; }
    main { width: min(1040px, calc(100% - 32px)); margin: 32px auto 56px; }
    .receipt { overflow: hidden; border: 1px solid var(--line); border-radius: 28px; background: var(--paper); box-shadow: 0 28px 80px rgba(62, 42, 18, .14); }
    header { padding: clamp(28px, 6vw, 72px); color: #f9f5ee; background: linear-gradient(130deg, #123c39, #0f766e); }
    .eyebrow, .badge { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: .72rem; }
    .eyebrow { padding: 7px 10px; color: #cce8df; background: rgba(255,255,255,.11); }
    h1 { max-width: 14ch; margin: 16px 0 12px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(2.7rem, 8vw, 5.4rem); line-height: .93; letter-spacing: -.055em; }
    header p { max-width: 72ch; margin: 0; color: #d7ebe4; font-size: 1.06rem; }
    .meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; color: #d7ebe4; font-size: .85rem; }
    .meta span { padding: 5px 9px; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; }
    .content { padding: clamp(22px, 4vw, 52px); }
    .decision { padding: 22px; border: 1px solid #b7dcd2; border-radius: 20px; background: var(--accent-soft); }
    h2 { margin: 0 0 14px; font-family: Georgia, "Times New Roman", serif; font-size: 1.65rem; letter-spacing: -.025em; }
    h3 { margin: 0 0 10px; font-size: .9rem; letter-spacing: .075em; text-transform: uppercase; }
    p { margin: 0 0 12px; }
    ul { margin: 0; padding-left: 1.25rem; }
    li + li { margin-top: 8px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(260px, .85fr); gap: 18px; margin-top: 18px; }
    .panel { padding: 22px; border: 1px solid var(--line); border-radius: 20px; background: #fffdf8; }
    .risk { border-color: #f0c9b7; background: var(--warn-soft); }
    .risk h2 { color: var(--warn); }
    .sources { margin-top: 18px; padding: 22px; border: 1px solid var(--line); border-radius: 20px; background: #fffdf8; }
    .source-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
    .source-card { display: flex; flex-direction: column; gap: 8px; min-height: 150px; padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: #fffaf2; }
    .source-card a { color: var(--accent); font-weight: 800; text-decoration-thickness: 1px; text-underline-offset: 3px; }
    .source-card span:last-child { margin-top: auto; color: var(--muted); font-size: .82rem; }
    .source-role { color: var(--muted); font-size: .72rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
    footer { padding: 20px clamp(22px, 4vw, 52px); border-top: 1px solid var(--line); color: var(--muted); font-size: .86rem; }
    @media (max-width: 720px) { main { width: min(100% - 20px, 1040px); margin-top: 10px; } .receipt { border-radius: 20px; } .grid, .source-list { grid-template-columns: 1fr; } h1 { max-width: none; } }
    @media print { body { background: #fff; } main { width: 100%; margin: 0; } .receipt { border: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <main>
    <article class="receipt">
      <header>
        <span class="eyebrow">Local-first research receipt</span>
        <h1>${escapeHtml(demo.title)}</h1>
        <p>${escapeHtml(demo.scenario)}</p>
        <div class="meta"><span>Deterministic fixture</span><span>No key, browser, or live request</span><span>${demo.sources.length} linked sources</span></div>
      </header>
      <div class="content">
        <section class="decision"><h2>Decision</h2>${renderMarkdownFragment(decision)}</section>
        <div class="grid">
          <section class="panel"><h2>What the evidence supports</h2>${renderMarkdownFragment(findings)}</section>
          <section class="panel risk"><h2>What could invalidate this</h2>${renderMarkdownFragment(contradictions)}</section>
        </div>
        <section class="sources"><h2>Source trail</h2><ul class="source-list">${sourceCards}</ul></section>
        <section class="panel" style="margin-top:18px"><h2>Smallest next validation</h2>${renderMarkdownFragment(nextValidation)}</section>
      </div>
      <footer>This receipt is a bundled, deterministic fixture. It demonstrates the decision-package contract; it is not a claim that fresh research produced these findings.</footer>
    </article>
  </main>
</body>
</html>`;
}

export function listDemoFixtures(): DemoFixture[] {
  return [...DEMOS];
}

export function writeDemoPackage(input: {
  id: string;
  outputDir: string;
  force?: boolean;
}): WrittenDemoPackage {
  const demo = findDemo(input.id);
  const outputDir = path.resolve(input.outputDir);
  const force = Boolean(input.force);
  const reportPath = path.join(outputDir, "report.md");
  const workflowBriefPath = path.join(outputDir, "handoff", "workflow-brief.md");
  const sourcesPath = path.join(outputDir, "evidence", "sources.json");
  const manifestPath = path.join(outputDir, "package-manifest.json");
  const receiptPath = path.join(outputDir, "receipt.html");
  const receiptJsonPath = path.join(outputDir, "receipt.json");
  const integrityManifestPath = path.join(outputDir, "integrity-manifest.json");
  const readmePath = path.join(outputDir, "README.md");
  const snapshotPaths = demo.sources.map((source, index) =>
    path.join(outputDir, "evidence", "snapshots", `source-${index + 1}.md`)
  );

  writeFile(reportPath, `${demo.report}\n`, force);
  writeFile(workflowBriefPath, `${demo.workflowBrief}\n`, force);
  writeFile(sourcesPath, `${JSON.stringify(demo.sources, null, 2)}\n`, force);
  demo.sources.forEach((source, index) => {
    writeFile(
      snapshotPaths[index]!,
      [
        `# Deterministic fixture snapshot — ${source.title}`,
        "",
        `- URL: ${source.url}`,
        `- Publisher: ${source.publisher}`,
        `- Captured: ${source.accessedAt}`,
        "- Capture type: fixture-synthetic",
        "",
        "This snapshot is bundled evidence for the deterministic demo. It is not a live copy of the linked page.",
        "",
        `Scenario: ${demo.scenario}`,
        "",
        demo.report
      ].join("\n") + "\n",
      force
    );
  });
  writeFile(
    manifestPath,
    `${JSON.stringify({ version: 1, type: "deterministic-demo", id: demo.id, title: demo.title, scenario: demo.scenario, generatedAt: FIXTURE_DATE, files: ["receipt.html", "receipt.json", "integrity-manifest.json", "report.md", "handoff/workflow-brief.md", "evidence/sources.json", "evidence/snapshots/"], receiptPath: "receipt.json", integrityManifestPath: "integrity-manifest.json" }, null, 2)}\n`,
    force
  );
  writeFile(receiptPath, renderDemoReceiptHtml(demo), force);
  writeFile(
    readmePath,
    `# ${demo.title}\n\nThis is a deterministic, bundled demo package. It proves the package shape and source-trace reading flow without using an API key, browser session, or live network request. It is not a claim that a fresh live run produced these findings.\n\nScenario: ${demo.scenario}\n\nStart with [receipt.html](receipt.html) for the visual decision handoff, then inspect [receipt.json](receipt.json), run \`web-task-agent receipt verify .\`, and read [handoff/workflow-brief.md](handoff/workflow-brief.md), [report.md](report.md), and [evidence/sources.json](evidence/sources.json).\n`,
    force
  );
  const receipt = buildFixtureDecisionReceipt(
    {
      id: demo.id,
      title: demo.title,
      scenario: demo.scenario,
      report: demo.report,
      sources: demo.sources,
      generatedAt: FIXTURE_DATE
    },
    {
      receiptPath: receiptJsonPath,
      integrityManifestPath,
      reportPath,
      workflowBriefPath,
      sourcesPath,
      packageManifestPath: manifestPath,
      packageReadmePath: readmePath,
      snapshotPaths
    }
  );
  writeFile(receiptJsonPath, `${JSON.stringify(receipt, null, 2)}\n`, force);
  writeReceiptIntegrityManifest({
    rootDir: outputDir,
    files: [reportPath, workflowBriefPath, sourcesPath, manifestPath, readmePath, receiptPath, receiptJsonPath, ...snapshotPaths],
    generatedAt: FIXTURE_DATE
  });

  return {
    outputDir,
    reportPath,
    workflowBriefPath,
    sourcesPath,
    manifestPath,
    receiptPath,
    receiptJsonPath,
    integrityManifestPath
  };
}
