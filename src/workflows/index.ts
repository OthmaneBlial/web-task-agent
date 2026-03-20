import type { AgentRunOptions } from "../types";

export interface WorkflowTemplateDefinition {
  id: "android-opportunity" | "article-research";
  title: string;
  description: string;
  defaultOptions: Pick<
    AgentRunOptions,
    "maxQueries" | "maxResultsPerQuery" | "fetchBatchSize" | "maxRuntimeHours"
  >;
  buildInstruction(input: {
    topic: string;
    audience?: string | null;
    context?: string | null;
  }): string;
}

const WORKFLOW_TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    id: "android-opportunity",
    title: "Android Opportunity Research",
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
    }
  },
  {
    id: "article-research",
    title: "Technical Article Research",
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

export function buildWorkflowRunOptions(input: {
  templateId: string;
  topic: string;
  audience?: string | null;
  context?: string | null;
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

  return {
    instruction: template.buildInstruction({
      topic: input.topic,
      audience: input.audience ?? null,
      context: input.context ?? null
    }),
    resume: Boolean(input.overrides?.resume),
    cachePath: input.overrides?.cachePath,
    cacheDir: input.overrides?.cacheDir,
    reportPath: input.overrides?.reportPath,
    memoryPath: input.overrides?.memoryPath,
    maxQueries: input.overrides?.maxQueries ?? template.defaultOptions.maxQueries,
    maxResultsPerQuery:
      input.overrides?.maxResultsPerQuery ?? template.defaultOptions.maxResultsPerQuery,
    fetchBatchSize: input.overrides?.fetchBatchSize ?? template.defaultOptions.fetchBatchSize,
    maxRuntimeHours: input.overrides?.maxRuntimeHours ?? template.defaultOptions.maxRuntimeHours,
    leaseTtlMinutes: input.overrides?.leaseTtlMinutes,
    workflowName: template.id,
    workflowTemplateId: template.id,
    workflowInputs: {
      topic: input.topic,
      audience: input.audience ?? null,
      context: input.context ?? null
    },
    jobTitle: `${template.title}: ${input.topic}`
  };
}
