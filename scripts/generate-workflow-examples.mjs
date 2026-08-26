import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { listWorkflowTemplates } = require("../dist/workflows");
const outputRoot = path.resolve("examples/workflows");
const catalogRoot = path.join(outputRoot, "catalog");
const catalog = listWorkflowTemplates().filter((template) => template.tags?.includes("catalog"));

if (catalog.length < 200) {
  throw new Error(`Expected at least 200 catalog workflows, found ${catalog.length}. Run npm run build first.`);
}

function escapeMarkdown(value) {
  return value.replace(/`/g, "\\`");
}

function toBulletList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderWorkflowExample(template) {
  const topic = template.id.includes("mobile-apps")
    ? "subscription retention for meditation apps"
    : template.id.includes("ai-developer-tools")
      ? "code review agents for TypeScript teams"
      : template.id.includes("ecommerce")
        ? "returns automation for Shopify stores"
        : "a focused product or market question";

  return [
    `# ${template.title}`,
    "",
    `**Category:** ${template.category ?? "Research"}`,
    "",
    template.description,
    "",
    "## When to use it",
    "",
    template.decisionFocus ?? "Use this workflow when you need an evidence-backed decision package.",
    "",
    "## Run it",
    "",
    "```bash",
    `web-task-agent workflow run ${template.id} ` + "\\",
    `  --topic \"${escapeMarkdown(topic)}\" ` + "\\",
    "  --preset standard",
    "```",
    "",
    "Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.",
    "",
    "## Decision-ready output",
    "",
    toBulletList(template.expectedDeliverables ?? ["evidence-backed findings", "contradictions to resolve", "next validation steps"]),
    "",
    "## Source strategy",
    "",
    toBulletList(template.preferredSources ?? ["official documentation", "public product pages", "public community discussions"]),
    "",
    "The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.",
    "",
    "## Explore related workflows",
    "",
    "```bash",
    `web-task-agent workflow list --category \"${escapeMarkdown(template.category ?? "Research")}\"`,
    "```"
  ].join("\n");
}

const byCategory = new Map();
for (const template of catalog) {
  const category = template.category ?? "Research";
  const group = byCategory.get(category) ?? [];
  group.push(template);
  byCategory.set(category, group);
}

for (const template of catalog) {
  const relativePath = template.examplePath.replace(/^examples\/workflows\//, "");
  const destination = path.join(outputRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${renderWorkflowExample(template)}\n`, "utf8");
}

const indexLines = [
  "# Workflow Catalog",
  "",
  `Web Task Agent ships **${catalog.length} executable research workflows** in this catalog, in addition to the three core templates. Each entry is a real CLI template with a focused instruction, query strategy, stable output package, evidence trail, resumability, and queue support.`,
  "",
  "The catalog is organised by decision rather than by a pile of near-duplicate prompts. Pick a research objective below, then use a domain-specific workflow or filter from the command line.",
  "",
  "```bash",
  "web-task-agent workflow list --category \"Voice of Customer\"",
  "web-task-agent workflow list --search cybersecurity",
  "```",
  "",
  "## Catalog families",
  ""
];

for (const [category, templates] of byCategory) {
  const folder = templates[0].examplePath
    .replace(/^examples\/workflows\/catalog\//, "")
    .split("/")[0];
  indexLines.push(`### ${category} (${templates.length})`, "");
  indexLines.push(...templates.map((template) => `- [${template.title}](catalog/${folder}/${template.id}.md)`), "");
}

fs.mkdirSync(catalogRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, "CATALOG.md"), `${indexLines.join("\n").trim()}\n`, "utf8");
console.log(`Generated ${catalog.length} executable workflow examples under ${path.relative(process.cwd(), catalogRoot)}.`);
