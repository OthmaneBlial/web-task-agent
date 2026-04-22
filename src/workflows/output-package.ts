import fs from "node:fs";
import path from "node:path";

import { ensureDir, writeJsonAtomic } from "../lib/cache";
import type {
  AgentEvidenceBundle,
  AgentResearchReferenceItem,
  AgentRunState
} from "../types";
import {
  getWorkflowTemplate,
  type WorkflowTemplateDefinition
} from "./index";

export interface AgentOutputPaths {
  planPath: string;
  pipelineManifestPath: string;
  promptTracePath: string;
  researchSummaryPath: string;
  postDraftPath: string;
  commentsDraftPath: string;
  workflowBriefPath: string;
  packageManifestPath: string;
  packageReadmePath: string;
  researchDir: string;
}

function trimLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function relativeArtifactPath(artifactDir: string, filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }
  return path.relative(artifactDir, filePath) || ".";
}

function resolveWorkflowTopic(state: AgentRunState): string {
  return (
    state.input.workflowInputs.topic ??
    state.input.jobTitle ??
    state.runId
  );
}

function topReferenceTexts(
  items: AgentResearchReferenceItem[] | undefined,
  limit: number
): string[] {
  return (items ?? [])
    .map((item) => trimLine(item.text))
    .filter(Boolean)
    .slice(0, limit);
}

function formatBulletList(items: string[], emptyText: string): string[] {
  if (items.length === 0) {
    return [`- ${emptyText}`];
  }
  return items.map((item) => `- ${item}`);
}

function topClusterLabels(
  evidence: AgentEvidenceBundle,
  kinds: AgentEvidenceBundle["clusters"][number]["kind"][],
  limit: number
): string[] {
  return evidence.clusters
    .filter((cluster) => kinds.includes(cluster.kind))
    .slice(0, limit)
    .map((cluster) => `${cluster.label} (${Math.round(cluster.trendScore * 100)}% trend)`);
}

function renderAndroidOpportunityBrief(
  state: AgentRunState,
  evidence: AgentEvidenceBundle
): string {
  const summary = state.researchSummary;
  const appConcepts = topReferenceTexts(summary?.contentAngleDetails, 5);
  const launchHooks = topReferenceTexts(summary?.keyFindingDetails, 5);
  const pains = topClusterLabels(evidence, ["complaint"], 6);
  const requests = topClusterLabels(evidence, ["feature_request"], 6);

  return [
    "# Opportunity Brief",
    "",
    `Topic: ${resolveWorkflowTopic(state)}`,
    `Preset: ${state.input.workflowPresetId ?? "standard"}`,
    "",
    "## Market Read",
    "",
    summary?.executiveSummary || "Research complete. Review the linked evidence package.",
    "",
    "## Repeated User Pains",
    "",
    ...formatBulletList(pains, "No repeated complaint cluster was detected."),
    "",
    "## Repeated Feature Demand",
    "",
    ...formatBulletList(requests, "No repeated feature-request cluster was detected."),
    "",
    "## App Concept Shortlist",
    "",
    ...formatBulletList(appConcepts, "No content-angle shortlist was generated."),
    "",
    "## Monetization Ideas",
    "",
    `- Freemium core with premium export or automation limits for ${resolveWorkflowTopic(state)}.`,
    "- Paid advanced workflows, templates, or integrations for power users.",
    "- Subscription tiers that unlock the highest-value automation or convenience features.",
    "",
    "## Launch Hooks",
    "",
    ...formatBulletList(launchHooks, "No evidence-backed launch hooks were generated."),
    "",
    "## Validation Checklist",
    "",
    "- Check competitor pricing and subscription tiers before locking the offer.",
    "- Confirm that the strongest pain cluster maps to a feature users will pay for.",
    "- Verify that the app concept can ship with a narrow but obvious MVP.",
    "",
    "## Operator Next Moves",
    "",
    "- Validate the top 2 concepts against Play Store reviews and monetization patterns.",
    "- Translate the strongest pains into an MVP feature list before writing product specs.",
    "- Use the final report plus evidence references when prioritizing concept selection."
  ].join("\n").trim();
}

function renderArticleResearchBrief(
  state: AgentRunState,
  evidence: AgentEvidenceBundle
): string {
  const summary = state.researchSummary;
  const findings = topReferenceTexts(summary?.keyFindingDetails, 6);
  const angles = topReferenceTexts(summary?.contentAngleDetails, 5);
  const contradictions = evidence.contradictions
    .slice(0, 5)
    .map((item) => `${item.topic}: ${item.leftLabel} vs ${item.rightLabel}`);
  const claimChecklist = [
    ...findings.slice(0, 4).map((item) => `Verify: ${item}`),
    ...contradictions.slice(0, 3).map((item) => `Resolve: ${item}`)
  ];

  return [
    "# Article Brief",
    "",
    `Topic: ${resolveWorkflowTopic(state)}`,
    `Preset: ${state.input.workflowPresetId ?? "standard"}`,
    "",
    "## Story Thesis",
    "",
    summary?.executiveSummary || "Research complete. Review the report and evidence-backed findings.",
    "",
    "## Key Findings",
    "",
    ...formatBulletList(findings, "No key findings were generated."),
    "",
    "## Article Angles",
    "",
    ...formatBulletList(angles, "No article angles were generated."),
    "",
    "## Claim Checklist",
    "",
    ...formatBulletList(claimChecklist, "No claims were generated."),
    "",
    "## Contradictions To Handle Carefully",
    "",
    ...formatBulletList(contradictions, "No major contradiction cluster was detected."),
    "",
    "## Suggested Outline",
    "",
    "- Opening: frame why the topic matters now.",
    "- Current state: explain the strongest repeated evidence-backed patterns.",
    "- Tension: cover disagreements, edge cases, or misleading narratives.",
    "- Practical takeaway: end with what builders or operators should do next.",
    "",
    "## Writing Checklist",
    "",
    "- Cross-check every strong claim against the evidence references in the report.",
    "- Explicitly mention contradictions instead of flattening them into consensus.",
    "- Prefer recent and higher-trend clusters when choosing final examples."
  ].join("\n").trim();
}

function renderMarketOpportunityBrief(
  state: AgentRunState,
  evidence: AgentEvidenceBundle
): string {
  const summary = state.researchSummary;
  const pains = topClusterLabels(evidence, ["complaint"], 6);
  const requests = topClusterLabels(evidence, ["feature_request"], 6);
  const concepts = topReferenceTexts(summary?.contentAngleDetails, 5);
  const claims = topReferenceTexts(summary?.keyFindingDetails, 5);

  return [
    "# Opportunity Brief",
    "",
    `Topic: ${resolveWorkflowTopic(state)}`,
    `Preset: ${state.input.workflowPresetId ?? "standard"}`,
    "",
    "## Market Read",
    "",
    summary?.executiveSummary || "Research complete. Review the linked evidence package.",
    "",
    "## Repeated User Pains",
    "",
    ...formatBulletList(pains, "No repeated complaint cluster was detected."),
    "",
    "## Feature Demand",
    "",
    ...formatBulletList(requests, "No repeated feature-request cluster was detected."),
    "",
    "## Opportunity Shortlist",
    "",
    ...formatBulletList(concepts, "No content-angle shortlist was generated."),
    "",
    "## Key Claims",
    "",
    ...formatBulletList(claims, "No evidence-backed claims were generated."),
    "",
    "## Pricing Ideas",
    "",
    `- Freemium core with premium limits around ${resolveWorkflowTopic(state)}.`,
    "- Subscription tiers for the highest-value automation or convenience features.",
    "- Annual plans if the product needs recurring workflow access or team usage.",
    "",
    "## Validation Checklist",
    "",
    "- Verify pricing against the closest competitors before choosing an offer.",
    "- Confirm that the strongest pain cluster maps to a feature users will pay for.",
    "- Check whether the MVP can be narrow enough to ship without scope creep."
  ].join("\n").trim();
}

function renderWorkflowBrief(
  template: WorkflowTemplateDefinition,
  state: AgentRunState,
  evidence: AgentEvidenceBundle
): string {
  if (template.id === "android-opportunity") {
    return renderAndroidOpportunityBrief(state, evidence);
  }
  if (template.id === "article-research") {
    return renderArticleResearchBrief(state, evidence);
  }
  if (template.id === "market-opportunity") {
    return renderMarketOpportunityBrief(state, evidence);
  }

  return [
    `# ${template.handoffTitle}`,
    "",
    state.researchSummary?.executiveSummary || "Workflow output package ready."
  ].join("\n");
}

function renderWorkflowPackageReadme(
  template: WorkflowTemplateDefinition,
  state: AgentRunState,
  evidence: AgentEvidenceBundle,
  outputPaths: AgentOutputPaths
): string {
  const files = [
    `- Final report: ${relativeArtifactPath(state.artifactDir, state.reportPath)}`,
    `- Research summary: ${relativeArtifactPath(state.artifactDir, outputPaths.researchSummaryPath)}`,
    `- Workflow brief: ${relativeArtifactPath(state.artifactDir, outputPaths.workflowBriefPath)}`,
    `- Plan: ${relativeArtifactPath(state.artifactDir, outputPaths.planPath)}`,
    `- Drafts: ${relativeArtifactPath(state.artifactDir, outputPaths.postDraftPath)} and ${relativeArtifactPath(state.artifactDir, outputPaths.commentsDraftPath)}`,
    `- Raw research snapshots: ${relativeArtifactPath(state.artifactDir, outputPaths.researchDir)}`,
    `- Runtime manifest: ${relativeArtifactPath(state.artifactDir, outputPaths.pipelineManifestPath)}`,
    `- Prompt traces: ${relativeArtifactPath(state.artifactDir, outputPaths.promptTracePath)}`
  ];

  const readingOrder = [
    "- Start with the workflow brief for a decision-ready summary.",
    "- Open the final report for citations, contradictions, and supporting context.",
    "- Use the research summary when you need the shortest evidence-backed synopsis.",
    "- Inspect the plan and runtime manifest when you want to understand how the run was assembled.",
    "- Review the raw research snapshots only if you need to extend or audit the run."
  ];

  const reuseTips = [
    "- Copy the workflow brief into a writing doc or handoff note to reuse the strongest findings immediately.",
    "- Lift the final report's claim checklist into a follow-up validation task or editorial checklist.",
    "- Reuse the evidence counts and example reference when comparing this run with future runs.",
    "- Use the prompt traces only when you want to tune the workflow or investigate a weak output."
  ];

  return [
    `# ${template.handoffTitle}`,
    "",
    `Workflow: ${template.title}`,
    `Topic: ${resolveWorkflowTopic(state)}`,
    `Preset: ${state.input.workflowPresetId ?? "standard"}`,
    `Status: ${state.status}`,
    "",
    "## Package Overview",
    "",
    state.researchSummary?.executiveSummary || "Workflow package generated.",
    "",
    "## Quick Start",
    "",
    ...readingOrder,
    "",
    "## Included Files",
    "",
    ...files,
    "",
    "## Research Snapshot",
    "",
    `- Queries: ${evidence.counts.queries}`,
    `- Sources: ${evidence.counts.sources}`,
    `- Documents: ${evidence.counts.documents}`,
    `- Extractions: ${evidence.counts.extractions}`,
    `- Contradictions: ${evidence.counts.contradictions}`,
    "",
    "## Example Reference",
    "",
    `- Repo example for this workflow: ${template.examplePath}`,
    "",
    "## Reuse Tips",
    "",
    ...reuseTips
  ].join("\n").trim();
}

function validateWorkflowPackageStructure(outputPaths: AgentOutputPaths): {
  expected: string[];
  present: string[];
  missing: string[];
  allPresent: boolean;
} {
  const expectedEntries = [
    ["researchSummary", outputPaths.researchSummaryPath],
    ["workflowBrief", outputPaths.workflowBriefPath],
    ["plan", outputPaths.planPath],
    ["postDraft", outputPaths.postDraftPath],
    ["commentsDraft", outputPaths.commentsDraftPath],
    ["rawResearchDir", outputPaths.researchDir],
    ["runtimeManifest", outputPaths.pipelineManifestPath],
    ["promptTraces", outputPaths.promptTracePath],
    ["packageManifest", outputPaths.packageManifestPath],
    ["packageReadme", outputPaths.packageReadmePath]
  ] as const;

  const present = expectedEntries
    .filter(([, filePath]) => Boolean(filePath) && fs.existsSync(String(filePath)))
    .map(([label]) => label);
  const missing = expectedEntries
    .filter(([, filePath]) => !filePath || !fs.existsSync(String(filePath)))
    .map(([label]) => label);

  return {
    expected: expectedEntries.map(([label]) => label),
    present,
    missing,
    allPresent: missing.length === 0
  };
}

export function buildAgentOutputPaths(artifactDir: string): AgentOutputPaths {
  return {
    planPath: path.join(artifactDir, "plan", "plan.json"),
    pipelineManifestPath: path.join(artifactDir, "runtime", "pipeline-manifest.json"),
    promptTracePath: path.join(artifactDir, "runtime", "llm-prompt-traces.json"),
    researchSummaryPath: path.join(artifactDir, "handoff", "research-summary.md"),
    postDraftPath: path.join(artifactDir, "drafts", "post-draft.md"),
    commentsDraftPath: path.join(artifactDir, "drafts", "comments-draft.md"),
    workflowBriefPath: path.join(artifactDir, "handoff", "workflow-brief.md"),
    packageManifestPath: path.join(artifactDir, "handoff", "package-manifest.json"),
    packageReadmePath: path.join(artifactDir, "handoff", "README.md"),
    researchDir: path.join(artifactDir, "raw", "research")
  };
}

export function applyAgentOutputPaths(state: AgentRunState): AgentOutputPaths {
  const layout = buildAgentOutputPaths(state.artifactDir);
  state.outputs.planPath = state.outputs.planPath ?? layout.planPath;
  state.outputs.pipelineManifestPath =
    state.outputs.pipelineManifestPath ?? layout.pipelineManifestPath;
  state.outputs.promptTracePath = state.outputs.promptTracePath ?? layout.promptTracePath;
  state.outputs.researchSummaryPath =
    state.outputs.researchSummaryPath ?? layout.researchSummaryPath;
  state.outputs.postDraftPath = state.outputs.postDraftPath ?? layout.postDraftPath;
  state.outputs.commentsDraftPath =
    state.outputs.commentsDraftPath ?? layout.commentsDraftPath;
  state.outputs.workflowBriefPath =
    state.outputs.workflowBriefPath ?? layout.workflowBriefPath;
  state.outputs.packageManifestPath =
    state.outputs.packageManifestPath ?? layout.packageManifestPath;
  state.outputs.packageReadmePath =
    state.outputs.packageReadmePath ?? layout.packageReadmePath;
  return layout;
}

export function writeWorkflowPackageArtifacts(
  state: AgentRunState,
  evidence: AgentEvidenceBundle
): {
  workflowBriefPath: string | null;
  packageManifestPath: string | null;
  packageReadmePath: string | null;
} {
  const template = state.input.workflowTemplateId
    ? getWorkflowTemplate(state.input.workflowTemplateId)
    : undefined;
  if (!template) {
    return {
      workflowBriefPath: null,
      packageManifestPath: null,
      packageReadmePath: null
    };
  }

  const outputPaths = applyAgentOutputPaths(state);
  ensureDir(path.dirname(outputPaths.workflowBriefPath));
  ensureDir(path.dirname(outputPaths.packageManifestPath));

  const workflowBrief = renderWorkflowBrief(template, state, evidence);
  fs.writeFileSync(outputPaths.workflowBriefPath, `${workflowBrief.trim()}\n`, "utf8");

  const manifest = {
    generatedAt: state.updatedAt,
    workflowId: template.id,
    workflowTitle: template.title,
    handoffTitle: template.handoffTitle,
    topic: resolveWorkflowTopic(state),
    preset: state.input.workflowPresetId ?? "standard",
    status: state.status,
    examplePath: template.examplePath,
    reportPath: relativeArtifactPath(state.artifactDir, state.reportPath),
    files: {
      researchSummary: relativeArtifactPath(state.artifactDir, outputPaths.researchSummaryPath),
      workflowBrief: relativeArtifactPath(state.artifactDir, outputPaths.workflowBriefPath),
      plan: relativeArtifactPath(state.artifactDir, outputPaths.planPath),
      postDraft: relativeArtifactPath(state.artifactDir, outputPaths.postDraftPath),
      commentsDraft: relativeArtifactPath(state.artifactDir, outputPaths.commentsDraftPath),
      rawResearchDir: relativeArtifactPath(state.artifactDir, outputPaths.researchDir),
      runtimeManifest: relativeArtifactPath(state.artifactDir, outputPaths.pipelineManifestPath),
      promptTraces: relativeArtifactPath(state.artifactDir, outputPaths.promptTracePath)
    },
    evidenceCounts: evidence.counts,
    layoutChecks: validateWorkflowPackageStructure(outputPaths)
  };
  writeJsonAtomic(outputPaths.packageManifestPath, manifest);

  const packageReadme = renderWorkflowPackageReadme(template, state, evidence, outputPaths);
  fs.writeFileSync(outputPaths.packageReadmePath, `${packageReadme.trim()}\n`, "utf8");

  state.outputs.workflowBriefPath = outputPaths.workflowBriefPath;
  state.outputs.packageManifestPath = outputPaths.packageManifestPath;
  state.outputs.packageReadmePath = outputPaths.packageReadmePath;

  return {
    workflowBriefPath: outputPaths.workflowBriefPath,
    packageManifestPath: outputPaths.packageManifestPath,
    packageReadmePath: outputPaths.packageReadmePath
  };
}
