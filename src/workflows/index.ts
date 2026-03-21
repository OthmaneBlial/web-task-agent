import path from "node:path";

import type { AgentRunOptions } from "../types";

export type WorkflowTemplateId = "android-opportunity" | "article-research";
export type WorkflowPresetId = "fast" | "standard" | "deep";

export interface WorkflowPresetDefinition {
  id: WorkflowPresetId;
  title: string;
  description: string;
  options: Pick<
    AgentRunOptions,
    "maxQueries" | "maxResultsPerQuery" | "fetchBatchSize" | "maxRuntimeHours"
  >;
}

export interface WorkflowTemplateDefinition {
  id: WorkflowTemplateId;
  title: string;
  description: string;
  handoffTitle: string;
  briefFilename: string;
  examplePath: string;
  defaultPresetId: WorkflowPresetId;
  presets: WorkflowPresetDefinition[];
  defaultOptions: Pick<
    AgentRunOptions,
    "maxQueries" | "maxResultsPerQuery" | "fetchBatchSize" | "maxRuntimeHours"
  >;
  buildInstruction(input: {
    topic: string;
    audience?: string | null;
    context?: string | null;
  }): string;
  buildResearchQueries?(input: {
    topic: string;
    audience?: string | null;
    context?: string | null;
    maxQueries: number;
  }): string[];
}

function slugifyPathSegment(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "workflow";
}

function buildPresetSet(input: {
  standard: WorkflowPresetDefinition["options"];
  fast: WorkflowPresetDefinition["options"];
  deep: WorkflowPresetDefinition["options"];
}): WorkflowPresetDefinition[] {
  return [
    {
      id: "fast",
      title: "Fast",
      description: "Smaller run for quick market checks and early direction.",
      options: input.fast
    },
    {
      id: "standard",
      title: "Standard",
      description: "Balanced run for normal operator use.",
      options: input.standard
    },
    {
      id: "deep",
      title: "Deep",
      description: "Larger run for higher-confidence research packages.",
      options: input.deep
    }
  ];
}

function uniqueQueries(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const query = value.replace(/\s+/g, " ").trim();
    const key = query.toLowerCase();
    if (!query || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(query);
    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

function buildAndroidOpportunityResearchQueries(input: {
  topic: string;
  maxQueries: number;
}): string[] {
  const topic = input.topic.trim();
  const broadTopic = topic.toLowerCase().includes("study planner") ? topic : `${topic} study planner`;

  return uniqueQueries(
    [
      `"${broadTopic}" android app reddit complaints`,
      `site:play.google.com "${broadTopic}" reviews complaints`,
      `"${broadTopic}" students feature requests reddit forum`,
      `"study planner" app alternatives motion sunsama akiflow reddit students`,
      `"${broadTopic}" subscription complaints students`,
      `"${broadTopic}" time blocking student app pain points`,
      `"${broadTopic}" exam planner app review reddit`
    ],
    Math.max(1, Math.min(5, input.maxQueries))
  );
}

const WORKFLOW_TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    id: "android-opportunity",
    title: "Android Opportunity Research",
    handoffTitle: "Android Opportunity Package",
    briefFilename: "opportunity-brief.md",
    examplePath: "examples/workflows/android-opportunity.md",
    defaultPresetId: "standard",
    presets: buildPresetSet({
      fast: {
        maxQueries: 5,
        maxResultsPerQuery: 18,
        fetchBatchSize: 5,
        maxRuntimeHours: 4
      },
      standard: {
        maxQueries: 8,
        maxResultsPerQuery: 30,
        fetchBatchSize: 5,
        maxRuntimeHours: 8
      },
      deep: {
        maxQueries: 12,
        maxResultsPerQuery: 45,
        fetchBatchSize: 6,
        maxRuntimeHours: 12
      }
    }),
    description:
      "Find promising Android app opportunities by combining Play Store-style competitor research with broader web pain-point discovery.",
    defaultOptions: {
      maxQueries: 8,
      maxResultsPerQuery: 30,
      fetchBatchSize: 5,
      maxRuntimeHours: 8
    },
    buildInstruction(input) {
      const lines = [
        `Research Android app opportunities around "${input.topic}".`,
        "Search broadly across product pages, app reviews, competitor writeups, forums, Reddit-style discussions, and technical/product communities.",
        "Prefer actual study-planner apps, Play Store or App Store pages, student communities, and user-review threads over enterprise scheduler vendors, generic AI competitor-analysis tools, and thin SEO listicles.",
        "Focus on recurring complaints, feature gaps, monetization signals, retention hooks, and opportunities that could spread quickly.",
        "The final report must include: market summary, repeated user pains, competitor gaps, a shortlist of app concepts, MVP features, monetization ideas, risks, and evidence-backed launch hooks."
      ];
      if (input.audience) {
        lines.push(`Target audience to prioritize: ${input.audience}.`);
      }
      if (input.context) {
        lines.push(`Extra context: ${input.context}.`);
      }
      return lines.join("\n");
    },
    buildResearchQueries(input) {
      return buildAndroidOpportunityResearchQueries({
        topic: input.topic,
        maxQueries: input.maxQueries
      });
    }
  },
  {
    id: "article-research",
    title: "Technical Article Research",
    handoffTitle: "Technical Article Research Package",
    briefFilename: "article-brief.md",
    examplePath: "examples/workflows/article-research.md",
    defaultPresetId: "standard",
    presets: buildPresetSet({
      fast: {
        maxQueries: 4,
        maxResultsPerQuery: 18,
        fetchBatchSize: 5,
        maxRuntimeHours: 4
      },
      standard: {
        maxQueries: 6,
        maxResultsPerQuery: 25,
        fetchBatchSize: 5,
        maxRuntimeHours: 6
      },
      deep: {
        maxQueries: 10,
        maxResultsPerQuery: 35,
        fetchBatchSize: 6,
        maxRuntimeHours: 10
      }
    }),
    description:
      "Build an evidence-backed article research package around a technical or trend topic discussed heavily on the web.",
    defaultOptions: {
      maxQueries: 6,
      maxResultsPerQuery: 25,
      fetchBatchSize: 5,
      maxRuntimeHours: 6
    },
    buildInstruction(input) {
      const lines = [
        `Research the web conversation around "${input.topic}" and prepare a strong technical article brief.`,
        "Collect official documentation, engineering blog posts, release notes, issue discussions, commentary, and conflicting viewpoints when relevant.",
        "Focus on what is new, what experts disagree on, what examples are concrete, and which claims need extra caution.",
        "The final report must include: current landscape, evidence-backed key findings, disagreements or contradictions, article angles, outline ideas, and a claim checklist for writing."
      ];
      if (input.audience) {
        lines.push(`Primary audience: ${input.audience}.`);
      }
      if (input.context) {
        lines.push(`Extra context: ${input.context}.`);
      }
      return lines.join("\n");
    }
  }
];

export function listWorkflowTemplates(): WorkflowTemplateDefinition[] {
  return [...WORKFLOW_TEMPLATES];
}

export function getWorkflowTemplate(
  templateId: string
): WorkflowTemplateDefinition | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.id === templateId);
}

export function getWorkflowPreset(
  template: WorkflowTemplateDefinition,
  presetId?: string | null
): WorkflowPresetDefinition {
  const requestedPreset = presetId ?? template.defaultPresetId;
  const preset = template.presets.find((candidate) => candidate.id === requestedPreset);
  if (!preset) {
    throw new Error(`unknown workflow preset "${requestedPreset}" for template ${template.id}`);
  }
  return preset;
}

export function buildWorkflowCachePath(templateId: WorkflowTemplateId, topic: string): string {
  return path.join(
    process.cwd(),
    ".cache",
    "workflows",
    templateId,
    `${slugifyPathSegment(topic)}.json`
  );
}

export function buildWorkflowReportPath(templateId: WorkflowTemplateId, topic: string): string {
  return path.join(
    process.cwd(),
    "reports",
    "workflows",
    templateId,
    slugifyPathSegment(topic),
    "report.md"
  );
}

export function buildWorkflowRunOptions(input: {
  templateId: string;
  topic: string;
  audience?: string | null;
  context?: string | null;
  presetId?: string | null;
  overrides?: Partial<
    Pick<
      AgentRunOptions,
      | "resume"
      | "cachePath"
      | "cacheDir"
      | "reportPath"
      | "memoryPath"
      | "maxQueries"
      | "maxResultsPerQuery"
      | "fetchBatchSize"
      | "maxRuntimeHours"
      | "leaseTtlMinutes"
    >
  >;
}): AgentRunOptions {
  const template = getWorkflowTemplate(input.templateId);
  if (!template) {
    throw new Error(`unknown workflow template: ${input.templateId}`);
  }
  const preset = getWorkflowPreset(template, input.presetId);

  return {
    instruction: template.buildInstruction({
      topic: input.topic,
      audience: input.audience ?? null,
      context: input.context ?? null
    }),
    resume: Boolean(input.overrides?.resume),
    cachePath: input.overrides?.cachePath ?? buildWorkflowCachePath(template.id, input.topic),
    cacheDir: input.overrides?.cacheDir,
    reportPath: input.overrides?.reportPath ?? buildWorkflowReportPath(template.id, input.topic),
    memoryPath: input.overrides?.memoryPath,
    maxQueries: input.overrides?.maxQueries ?? preset.options.maxQueries,
    maxResultsPerQuery:
      input.overrides?.maxResultsPerQuery ?? preset.options.maxResultsPerQuery,
    fetchBatchSize: input.overrides?.fetchBatchSize ?? preset.options.fetchBatchSize,
    maxRuntimeHours: input.overrides?.maxRuntimeHours ?? preset.options.maxRuntimeHours,
    leaseTtlMinutes: input.overrides?.leaseTtlMinutes,
    workflowName: template.id,
    workflowPresetId: preset.id,
    workflowTemplateId: template.id,
    workflowInputs: {
      topic: input.topic,
      audience: input.audience ?? null,
      context: input.context ?? null,
      preset: preset.id
    },
    jobTitle: `${template.title}: ${input.topic}`
  };
}

export function buildWorkflowResearchQueries(input: {
  templateId: string | null | undefined;
  topic: string;
  audience?: string | null;
  context?: string | null;
  maxQueries?: number;
}): string[] {
  if (!input.templateId) {
    return [];
  }

  const template = getWorkflowTemplate(input.templateId);
  if (!template?.buildResearchQueries) {
    return [];
  }

  return template.buildResearchQueries({
    topic: input.topic,
    audience: input.audience ?? null,
    context: input.context ?? null,
    maxQueries: Math.max(1, Math.min(5, input.maxQueries ?? 5))
  });
}
