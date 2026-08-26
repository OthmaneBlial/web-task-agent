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
  assert.ok(catalogTemplates.every((template) => (template.preferredSources?.length ?? 0) >= 3));
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
  assert.ok(template?.preferredSources?.includes("public user reviews"));
  assert.equal(queries.length, 5);
  assert.ok(queries.every((query) => query.includes("security review workflow for SaaS teams")));
  assert.ok(queries.some((query) => query.includes("cybersecurity teams")));
  assert.ok(options.reportPath?.includes("cybersecurity-voice-of-customer"));
  assert.equal(options.workflowPresetId, "focused");
});

test("decision change review is a focused golden-path workflow", () => {
  const template = getWorkflowTemplate("decision-change-review");
  const queries = buildWorkflowResearchQueries({
    templateId: "decision-change-review",
    topic: "local browser research",
    maxQueries: 6
  });
  const options = buildWorkflowRunOptions({
    templateId: "decision-change-review",
    topic: "local browser research",
    presetId: "focused"
  });

  assert.ok(template);
  assert.equal(template?.category, "Decision Change");
  assert.ok(template?.tags?.includes("decision-receipt"));
  assert.ok(template?.expectedDeliverables?.includes("decision diff"));
  assert.equal(queries.length, 5);
  assert.ok(queries.every((query) => query.includes("local browser research")));
  assert.ok(options.reportPath?.includes("decision-change-review"));
});
