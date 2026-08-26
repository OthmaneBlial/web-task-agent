import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeWorkflowProposalId, writeWorkflowProposalScaffold } from "../workflows/scaffold";

test("workflow scaffold creates a reviewable definition, example, and test plan", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-scaffold-"));
  try {
    assert.equal(normalizeWorkflowProposalId("Developer Tool Review"), "developer-tool-review");
    const written = writeWorkflowProposalScaffold({ id: "Developer Tool Review", title: "Developer Tool Review", category: "Validation", outputDir: tempDir });
    assert.ok(fs.existsSync(written.definitionPath));
    assert.match(fs.readFileSync(written.examplePath, "utf8"), /not an automatically registered workflow/);
    assert.throws(() => writeWorkflowProposalScaffold({ id: "Developer Tool Review", title: "Developer Tool Review", category: "Validation", outputDir: tempDir }), /refusing to overwrite/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
