import path from "node:path";

import type { AgentRunOptions } from "../types";
import { WORKFLOW_CATALOG, type WorkflowCatalogEntry } from "./catalog";

export type WorkflowTemplateId = string;
export type WorkflowPresetId = "fast" | "focused" | "standard" | "deep";

export interface WorkflowPresetDefinition {
  id: WorkflowPresetId;
  title: string;
  description: string;
  options: Pick<
    AgentRunOptions,
    | "maxQueries"
    | "maxResultsPerQuery"
    | "fetchBatchSize"
    | "researchDurationMinutes"
    | "maxRuntimeHours"
  >;
}

export interface WorkflowTemplateDefinition {
  id: WorkflowTemplateId;
  title: string;
  description: string;
  handoffTitle: string;
  briefFilename: string;
  examplePath: string;
  category?: string;
  tags?: string[];
  decisionFocus?: string;
  expectedDeliverables?: string[];
  defaultPresetId: WorkflowPresetId;
  presets: WorkflowPresetDefinition[];
  defaultOptions: Pick<
    AgentRunOptions,
    | "maxQueries"
    | "maxResultsPerQuery"
    | "fetchBatchSize"
    | "researchDurationMinutes"
    | "maxRuntimeHours"
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
  focused: WorkflowPresetDefinition["options"];
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
      id: "focused",
      title: "Focused",
      description: "Balanced run for a narrower topic with better signal density.",
      options: input.focused
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

  return uniqueQueries(
    [
      `"${topic}" android app reddit complaints`,
      `site:play.google.com "${topic}" app reviews complaints`,
      `"${topic}" app feature requests reddit forum`,
      `"${topic}" android app alternatives reddit`,
      `"${topic}" app subscription complaints`,
      `"${topic}" app missing features users want`,
      `"${topic}" app review reddit`
    ],
    Math.max(1, Math.min(5, input.maxQueries))
  );
}

const CORE_WORKFLOW_TEMPLATES: WorkflowTemplateDefinition[] = [
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
      focused: {
        maxQueries: 7,
        maxResultsPerQuery: 24,
        fetchBatchSize: 5,
        maxRuntimeHours: 6
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
        "Prefer actual apps in this category, Play Store or App Store pages, user-review threads, and practitioner communities over enterprise SaaS vendors, unrelated verticals, generic competitor-analysis tools, and thin SEO listicles.",
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
      focused: {
        maxQueries: 5,
        maxResultsPerQuery: 20,
        fetchBatchSize: 5,
        maxRuntimeHours: 5
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
  },
  {
    id: "market-opportunity",
    title: "Product Opportunity Research",
    handoffTitle: "Product Opportunity Package",
    briefFilename: "opportunity-brief.md",
    examplePath: "examples/workflows/product-opportunity.md",
    defaultPresetId: "standard",
    presets: buildPresetSet({
      fast: {
        maxQueries: 4,
        maxResultsPerQuery: 18,
        fetchBatchSize: 5,
        maxRuntimeHours: 4
      },
      focused: {
        maxQueries: 6,
        maxResultsPerQuery: 24,
        fetchBatchSize: 5,
        maxRuntimeHours: 5
      },
      standard: {
        maxQueries: 8,
        maxResultsPerQuery: 30,
        fetchBatchSize: 5,
        maxRuntimeHours: 6
      },
      deep: {
        maxQueries: 12,
        maxResultsPerQuery: 40,
        fetchBatchSize: 6,
        maxRuntimeHours: 10
      }
    }),
    description:
      "Research a product opportunity, competitive gap, or monetization angle using docs, reviews, forums, and pricing signals.",
    defaultOptions: {
      maxQueries: 8,
      maxResultsPerQuery: 30,
      fetchBatchSize: 5,
      maxRuntimeHours: 6
    },
    buildInstruction(input) {
      const lines = [
        `Research the market around "${input.topic}" and prepare a concise opportunity brief.`,
        "Collect documentation, reviews, forums, competitor pages, pricing pages, and feature-request threads.",
        "Focus on recurring pains, differentiation, monetization hints, and practical validation steps.",
        "The final report must include: market summary, repeated pains, feature demand, competitor gaps, pricing ideas, risks, and a validation checklist."
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
      const topic = input.topic.trim();
      return uniqueQueries(
        [
          `"${topic}" reviews complaints`,
          `"${topic}" alternatives pricing`,
          `"${topic}" feature request forum`,
          `site:reddit.com "${topic}"`,
          `site:play.google.com "${topic}"`,
          `"${topic}" competitor analysis`,
          `"${topic}" monetization`
        ],
        Math.max(1, Math.min(6, input.maxQueries))
      );
    }
  }
];

function buildCatalogWorkflowTemplate(entry: WorkflowCatalogEntry): WorkflowTemplateDefinition {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    handoffTitle: `${entry.mission.title} Research Package`,
    briefFilename: "research-brief.md",
    examplePath: entry.examplePath,
    category: entry.category,
    tags: [entry.domain.id, entry.mission.id, "catalog"],
    decisionFocus: entry.mission.researchFocus,
    expectedDeliverables: entry.mission.deliverables,
    defaultPresetId: "standard",
    presets: buildPresetSet({
      fast: {
        maxQueries: 4,
        maxResultsPerQuery: 18,
        fetchBatchSize: 5,
        maxRuntimeHours: 3
      },
      focused: {
        maxQueries: 6,
        maxResultsPerQuery: 24,
        fetchBatchSize: 5,
        maxRuntimeHours: 5
      },
      standard: {
        maxQueries: 8,
        maxResultsPerQuery: 30,
        fetchBatchSize: 5,
        maxRuntimeHours: 6
      },
      deep: {
        maxQueries: 12,
        maxResultsPerQuery: 40,
        fetchBatchSize: 6,
        maxRuntimeHours: 10
      }
    }),
    defaultOptions: {
      maxQueries: 8,
      maxResultsPerQuery: 30,
      fetchBatchSize: 5,
      maxRuntimeHours: 6
    },
    buildInstruction(input) {
      const lines = [
        `Run the ${entry.title} workflow for "${input.topic}".`,
        `Domain context: ${entry.domain.description}.`,
        `Research objective: ${entry.mission.researchFocus}.`,
        "Use primary sources, product documentation, public pricing pages, user reviews, issue trackers, community discussions, and credible practitioner material where relevant.",
        "Do not treat a marketing claim, one review, or an SEO listicle as proof. Preserve disagreement, state uncertainty, and link each strong finding to evidence.",
        `The decision-ready handoff must include: ${entry.mission.deliverables.join(", ")}.`
      ];
      if (input.audience) {
        lines.push(`Audience to prioritize: ${input.audience}.`);
      }
      if (input.context) {
        lines.push(`Extra context and constraints: ${input.context}.`);
      }
      return lines.join("\n");
    },
    buildResearchQueries(input) {
      const topic = input.topic.trim();
      return uniqueQueries(
        entry.mission.querySuffixes.map(
          (suffix) => `"${topic}" ${entry.domain.searchContext} ${suffix}`
        ),
        Math.max(1, Math.min(6, input.maxQueries))
      );
    }
  };
}

const WORKFLOW_TEMPLATES: WorkflowTemplateDefinition[] = [
  ...CORE_WORKFLOW_TEMPLATES,
  ...WORKFLOW_CATALOG.map(buildCatalogWorkflowTemplate)
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
      | "researchDurationMinutes"
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
    researchDurationMinutes:
      input.overrides?.researchDurationMinutes ?? preset.options.researchDurationMinutes,
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
