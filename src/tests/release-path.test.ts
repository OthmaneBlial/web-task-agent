import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("npm publication preflight preserves the tokenless OIDC and immutable-version boundary", () => {
  const output = execFileSync(process.execPath, ["scripts/npm-publication-preflight.mjs", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  const report = JSON.parse(output) as {
    status: string;
    staticChecks: number;
    packages: Array<{ name: string; tag: string }>;
    registry: null;
    ownerGate: { status: string; boundary: string; sequence: string[] };
  };

  assert.equal(report.status, "configuration-valid");
  assert.ok(report.staticChecks >= 25);
  const rootPackage = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };
  const corePackage = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "packages", "decision-receipt", "package.json"), "utf8")
  ) as { version: string };
  assert.deepEqual(
    report.packages.map(({ name, tag }) => ({ name, tag })),
    [
      { name: "web-task-agent", tag: `v${rootPackage.version}` },
      { name: "@othmaneblial/decision-receipt", tag: `decision-receipt-v${corePackage.version}` }
    ]
  );
  assert.equal(report.registry, null);
  assert.equal(report.ownerGate.status, "external-owner-action-required");
  assert.match(report.ownerGate.boundary, /must already exist on npm/i);
  assert.ok(report.ownerGate.sequence.some((step) => /never-published version/i.test(step)));

  const workflow = fs.readFileSync(path.join(process.cwd(), ".github", "workflows", "publish-npm.yml"), "utf8");
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.[A-Za-z0-9_]*NPM/i);

  const publishingGuide = fs.readFileSync(path.join(process.cwd(), "PUBLISHING.md"), "utf8");
  assert.match(publishingGuide, /must already exist on the npm registry/i);
  assert.match(publishingGuide, /bump each package to a never-published version/i);
});
