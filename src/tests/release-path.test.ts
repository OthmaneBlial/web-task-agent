import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("public release path is tag-only and includes first-success evidence", () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), ".github", "workflows", "release.yml"),
    "utf8"
  );
  assert.match(workflow, /tags:\s*\n\s+- ["']v\*\.\*\.\*["']/);
  assert.match(workflow, /npm run release:check/);
  assert.match(workflow, /scripts\/first-success\.mjs/);
  assert.match(workflow, /SHA256SUMS/);
  assert.match(workflow, /actions\/attest-build-provenance@v2/);
});

test("first-success script does not require model or browser credentials", () => {
  const script = fs.readFileSync(path.join(process.cwd(), "scripts", "first-success.mjs"), "utf8");
  assert.match(script, /demo.*export/);
  assert.match(script, /receipt.*verify/);
  assert.doesNotMatch(script, /ANTHROPIC_API_KEY|CDP_PORT/);
});
