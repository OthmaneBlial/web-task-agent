import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { listDemoFixtures, writeDemoPackage } from "../demos";

test("bundled demos provide three source-linked packages without network or LLM access", () => {
  const fixtures = listDemoFixtures();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-demo-"));

  try {
    assert.equal(fixtures.length, 3);
    const written = writeDemoPackage({
      id: "browser-agent-landscape",
      outputDir: tempDir
    });

    assert.ok(fs.existsSync(written.reportPath));
    assert.ok(fs.existsSync(written.workflowBriefPath));
    assert.ok(fs.existsSync(written.sourcesPath));
    assert.ok(fs.existsSync(written.manifestPath));
    assert.match(fs.readFileSync(written.reportPath, "utf8"), /What the evidence supports/);
    assert.match(fs.readFileSync(written.workflowBriefPath, "utf8"), /Claim checklist/);
    assert.equal(JSON.parse(fs.readFileSync(written.sourcesPath, "utf8")).length, 3);
    assert.throws(
      () => writeDemoPackage({ id: "browser-agent-landscape", outputDir: tempDir }),
      /refusing to overwrite/
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
