import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkflowResearchQueries,
  buildWorkflowRunOptions,
  getWorkflowTemplate,
  listWorkflowTemplates
} from "../workflows";
import { WORKFLOW_CATALOG } from "../workflows/catalog";

test("workflow catalog exposes hundreds of distinct executable use cases", () => {
  const templates = listWorkflowTemplates();
  const catalogTemplates = templates.filter((template) => template.tags?.includes("catalog"));
  const ids = new Set(catalogTemplates.map((template) => template.id));
  const examplePaths = new Set(catalogTemplates.map((template) => template.examplePath));

  assert.ok(WORKFLOW_CATALOG.length >= 200);
  assert.equal(catalogTemplates.length, WORKFLOW_CATALOG.length);
  assert.equal(ids.size, catalogTemplates.length);
  assert.equal(examplePaths.size, catalogTemplates.length);
});

test("catalog workflow has its own decision focus, queries, and durable output path", () => {
  const templateId = "cybersecurity-voice-of-customer";
  const template = getWorkflowTemplate(templateId);
  const queries = buildWorkflowResearchQueries({
    templateId,
    topic: "security review workflow for SaaS teams",
    maxQueries: 5
  });
  const options = buildWorkflowRunOptions({
    templateId,
    topic: "security review workflow for SaaS teams",
    presetId: "focused"
  });

  assert.ok(template);
  assert.equal(template?.category, "Voice of Customer");
  assert.ok(template?.expectedDeliverables?.includes("ranked pain clusters"));
  assert.equal(queries.length, 5);
  assert.ok(queries.every((query) => query.includes("security review workflow for SaaS teams")));
  assert.ok(queries.some((query) => query.includes("cybersecurity teams")));
  assert.ok(options.reportPath?.includes("cybersecurity-voice-of-customer"));
  assert.equal(options.workflowPresetId, "focused");
});
