import fs from "node:fs";
import path from "node:path";

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
  const readmePath = path.join(outputDir, "README.md");

  writeFile(reportPath, `${demo.report}\n`, force);
  writeFile(workflowBriefPath, `${demo.workflowBrief}\n`, force);
  writeFile(sourcesPath, `${JSON.stringify(demo.sources, null, 2)}\n`, force);
  writeFile(
    manifestPath,
    `${JSON.stringify({ version: 1, type: "deterministic-demo", id: demo.id, title: demo.title, scenario: demo.scenario, generatedAt: FIXTURE_DATE, files: ["report.md", "handoff/workflow-brief.md", "evidence/sources.json"] }, null, 2)}\n`,
    force
  );
  writeFile(
    readmePath,
    `# ${demo.title}\n\nThis is a deterministic, bundled demo package. It proves the package shape and source-trace reading flow without using an API key, browser session, or live network request. It is not a claim that a fresh live run produced these findings.\n\nScenario: ${demo.scenario}\n\nStart with [handoff/workflow-brief.md](handoff/workflow-brief.md), then read [report.md](report.md) and inspect [evidence/sources.json](evidence/sources.json).\n`,
    force
  );

  return { outputDir, reportPath, workflowBriefPath, sourcesPath, manifestPath };
}
