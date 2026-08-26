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
      { title: "Web Task Agent workflow catalog", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/examples/workflows/CATALOG.md", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "existing workflow comparison" }
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
      { title: "Web Task Agent security policy", url: "https://github.com/OthmaneBlial/web-task-agent/blob/main/SECURITY.md", publisher: "Web Task Agent", accessedAt: FIXTURE_DATE, role: "project security boundary" }
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
