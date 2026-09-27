import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("public positioning explains source-backed research in plain language", () => {
  const readme = read("README.md");
  const homepage = read("docs/index.html");

  assert.match(readme, /Research with sources attached\./);
  assert.match(readme, /GitHub Actions are disabled for this repository/);
  assert.doesNotMatch(readme, /actions\/workflows\//);
  assert.match(homepage, /Research with sources attached\./);
  assert.match(homepage, /Get a short report, source links, and an offline file check\./);
  assert.match(homepage, /Try the sample/);
  assert.match(homepage, /Quick start/);
  assert.match(homepage, /href="receipt\.html"/);
  assert.match(homepage, /href="docs\.html#page=getting-started"/);
  assert.match(homepage, /href="verify\.html"/);
  assert.doesNotMatch(homepage, /Long-running research jobs|Management API|Execution Model/);
  assert.doesNotMatch(homepage, /<strong>243<\/strong>/);
});

test("homepage leads with a no-setup sample and clearly states verifier limits", () => {
  const homepage = read("docs/index.html");
  const styles = read("docs/styles.css");

  assert.match(homepage, /The sample uses saved data\. No account, API key, or research request\./);
  assert.match(homepage, /Integrity checks show whether files still match the manifest\. They do not prove a conclusion is true\./);
  assert.match(homepage, /aria-label="What the package includes"/);
  assert.doesNotMatch(homepage, /PUBLIC FIRST RUN|curl -fsSLO|npm install -g/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("launch materials identify v0.5.1 and record the delivered roadmap", () => {
  const launch = read("LAUNCH.md");
  const changelog = read("CHANGELOG.md");

  assert.match(launch, /^# Launch kit — Web Task Agent v0\.5\.1/m);
  assert.match(launch, /receipt verify/);
  assert.match(launch, /60-second tamper challenge/);
  assert.match(launch, /does not prove that a source, claim, or decision is true/);
  assert.doesNotMatch(launch, /v0\.4\.0/);
  assert.match(changelog, /Completed the previous P0–P4 productization roadmap/);
});

test("public surfaces stay inside web-task-agent instead of retired auxiliary repositories", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((relativePath) => fs.existsSync(path.join(process.cwd(), relativePath)));

  const forbiddenRepositoryReference = /decision-receipt-(?:action|demo)/i;
  for (const relativePath of trackedFiles) {
    const contents = fs.readFileSync(path.join(process.cwd(), relativePath));
    if (contents.includes(0)) continue;
    assert.doesNotMatch(contents.toString("utf8"), forbiddenRepositoryReference, relativePath);
  }
});
