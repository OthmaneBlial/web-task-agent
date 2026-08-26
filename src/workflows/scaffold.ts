import fs from "node:fs";
import path from "node:path";

export function normalizeWorkflowProposalId(value: string): string {
  const id = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) {
    throw new Error("workflow id must contain 3-80 lowercase letters, numbers, or hyphens");
  }
  return id;
}

export function writeWorkflowProposalScaffold(input: {
  id: string;
  title: string;
  category: string;
  outputDir: string;
  force?: boolean;
}): { definitionPath: string; examplePath: string; testPlanPath: string } {
  const id = normalizeWorkflowProposalId(input.id);
  const root = path.resolve(input.outputDir, id);
  const definitionPath = path.join(root, "workflow.json");
  const examplePath = path.join(root, "example.md");
  const testPlanPath = path.join(root, "test-plan.md");
  const paths = [definitionPath, examplePath, testPlanPath];
  if (!input.force && paths.some((filePath) => fs.existsSync(filePath))) {
    throw new Error(`refusing to overwrite workflow proposal at ${root}; pass --force to replace it.`);
  }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(definitionPath, `${JSON.stringify({ id, title: input.title.trim(), category: input.category.trim(), decision: "Describe the operator decision this workflow improves.", sourcePolicy: { preferred: ["official documentation", "first-party product pages", "public user reviews and community discussions"], excluded: ["authenticated pages", "thin SEO listicles", "access-control bypasses"] }, deliverables: ["decision-ready summary", "evidence links", "contradictions", "smallest next validation"], queries: ["Add a distinct, evidence-seeking query", "Add a second non-redundant query"], risks: ["List privacy, freshness, safety, or cost risks"] }, null, 2)}\n`, "utf8");
  fs.writeFileSync(examplePath, `# ${input.title.trim()}\n\n## Decision\n\nDescribe the repeated operator decision.\n\n## Run example\n\n\`\`\`bash\nweb-task-agent workflow run ${id} --topic \"a focused question\" --preset standard\n\`\`\`\n\n## Expected package\n\n- Evidence-backed summary\n- Source links and contradictions\n- A concrete next validation\n\n## Submission note\n\nThis scaffold is a proposal, not an automatically registered workflow. Complete the test plan, prove the workflow is distinct, then follow CONTRIBUTING.md to register it in the catalog.\n`, "utf8");
  fs.writeFileSync(testPlanPath, `# Test plan — ${input.title.trim()}\n\n- [ ] Id, title, category, source policy, query list, deliverables, and risks validate.\n- [ ] Queries are materially distinct from every closest catalog workflow.\n- [ ] A fixture proves the output preserves source links and contradictions.\n- [ ] Unsafe URLs and prompt-injection content are quarantined.\n- [ ] Docs and generated catalog example are updated.\n`, "utf8");
  return { definitionPath, examplePath, testPlanPath };
}
