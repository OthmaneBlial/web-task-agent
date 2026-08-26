export interface DecisionPackStep {
  workflowId: string;
  title: string;
  reason: string;
}

export interface DecisionPackDefinition {
  id: string;
  title: string;
  description: string;
  outcome: string;
  steps: DecisionPackStep[];
}

export const DECISION_PACKS: DecisionPackDefinition[] = [
  {
    id: "validate-an-idea",
    title: "Validate an Idea",
    description: "Separate evidence of a recurring problem from a plausible but untested product concept.",
    outcome: "A proceed, revise, or stop decision with the riskiest assumption named.",
    steps: [
      { workflowId: "b2b-saas-voice-of-customer", title: "Find repeated pain", reason: "Start with user language and situations, not the proposed feature." },
      { workflowId: "b2b-saas-competitor-map", title: "Map current alternatives", reason: "Check whether the pain is already solved well enough." },
      { workflowId: "b2b-saas-product-validation", title: "Design the smallest test", reason: "Turn the evidence into falsifiable proceed/stop criteria." }
    ]
  },
  {
    id: "launch-with-proof",
    title: "Launch with Proof",
    description: "Build a message and channel hypothesis from evidence before writing a launch post.",
    outcome: "A narrow positioning statement, proof requirements, and launch experiments.",
    steps: [
      { workflowId: "ai-developer-tools-audience-segmentation", title: "Choose the first audience", reason: "Avoid a message aimed at everyone." },
      { workflowId: "ai-developer-tools-launch-positioning", title: "Build the message", reason: "Use community language and explicit objections." },
      { workflowId: "ai-developer-tools-content-demand", title: "Find distribution hooks", reason: "Anchor outreach in questions people are already asking." }
    ]
  },
  {
    id: "understand-churn",
    title: "Understand Churn",
    description: "Trace why a user leaves and turn the strongest pattern into a retention experiment.",
    outcome: "Ranked churn risks, retention drivers, and one measurable next experiment.",
    steps: [
      { workflowId: "consumer-productivity-retention-churn", title: "Collect churn signals", reason: "Identify departure and downgrade language." },
      { workflowId: "consumer-productivity-feature-gap", title: "Test missing value", reason: "Distinguish a missing feature from an onboarding or trust problem." },
      { workflowId: "consumer-productivity-buyer-journey", title: "Repair activation", reason: "Locate the moment users fail to reach value." }
    ]
  },
  {
    id: "write-a-defensible-article",
    title: "Write a Defensible Article",
    description: "Research a technical claim, retain disagreement, then develop a source-backed angle.",
    outcome: "An article thesis, claim checklist, counterarguments, and distribution communities.",
    steps: [
      { workflowId: "article-research", title: "Research the technical landscape", reason: "Collect primary documentation, change notes, and disagreement." },
      { workflowId: "ai-developer-tools-content-demand", title: "Find the unanswered question", reason: "Choose an angle with demonstrated reader demand." }
    ]
  },
  {
    id: "choose-an-integration",
    title: "Choose an Integration",
    description: "Rank integrations by user pull, workflow fit, and implementation risk before committing a roadmap slot.",
    outcome: "A short integration shortlist with evidence, partner thesis, and explicit risks.",
    steps: [
      { workflowId: "api-platforms-integration-partnership", title: "Find ecosystem pull", reason: "Prioritize user-requested hand-offs over logo-driven lists." },
      { workflowId: "api-platforms-competitor-map", title: "Compare incumbent integrations", reason: "Identify table stakes and room for differentiation." },
      { workflowId: "api-platforms-product-validation", title: "Validate the smallest wedge", reason: "Choose a narrow first integration and stop criteria." }
    ]
  }
];

export function getDecisionPack(id: string): DecisionPackDefinition | undefined {
  return DECISION_PACKS.find((pack) => pack.id === id);
}

export function renderDecisionPackPlan(input: {
  pack: DecisionPackDefinition;
  topic: string;
  preset: string;
  audience?: string | null;
  context?: string | null;
}): string {
  const lines = [
    `# ${input.pack.title} Plan`,
    "",
    `Topic: ${input.topic}`,
    `Preset: ${input.preset}`,
    "",
    "## Decision outcome",
    "",
    input.pack.outcome,
    "",
    "## Review rule",
    "",
    "Run one step at a time. Review its evidence package before launching the next command; this pack never starts paid or browser work in the background.",
    ""
  ];
  input.pack.steps.forEach((step, index) => {
    lines.push(`## ${index + 1}. ${step.title}`, "", step.reason, "", "```bash");
    lines.push(`web-task-agent workflow run ${step.workflowId} \\`);
    lines.push(`  --topic \"${input.topic.replace(/"/g, "\\\"")}\" \\`);
    if (input.audience) lines.push(`  --audience \"${input.audience.replace(/"/g, "\\\"")}\" \\`);
    if (input.context) lines.push(`  --context \"${input.context.replace(/"/g, "\\\"")}\" \\`);
    lines.push(`  --preset ${input.preset}`, "```", "");
  });
  return lines.join("\n").trim();
}
