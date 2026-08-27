import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("public positioning leads with Decision Receipt verification", () => {
  const readme = read("README.md");
  const homepage = read("docs/index.html");

  assert.match(readme, /The verification layer for AI research/);
  assert.match(readme, /verify, challenge, and compare offline/);
  assert.match(homepage, /Verify the decision, not just the answer/);
  assert.match(homepage, /Inspect a verified receipt/);
  assert.match(homepage, /Integrity checked/);
  assert.match(homepage, /Contradictions explicit/);
  assert.doesNotMatch(homepage, /<strong>243<\/strong>/);
});

test("homepage first run is public, versioned, and accessible without a source checkout", () => {
  const homepage = read("docs/index.html");
  const styles = read("docs/styles.css");

  assert.match(homepage, /PUBLIC FIRST RUN · v0\.5\.1/);
  assert.match(homepage, /releases\/download\/v0\.5\.1/);
  assert.match(homepage, /receipt verify/);
  assert.doesNotMatch(homepage, /<code class="language-bash">npm ci/);
  assert.match(homepage, /aria-label="Decision receipt verification sequence"/);
  assert.match(homepage, /Read the animation transcript/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("launch materials identify v0.5.1 and record the delivered roadmap", () => {
  const launch = read("LAUNCH.md");
  const changelog = read("CHANGELOG.md");

  assert.match(launch, /^# Launch kit — Web Task Agent v0\.5\.1/m);
  assert.match(launch, /receipt verify/);
  assert.match(launch, /does not prove that a source, claim, or decision is true/);
  assert.doesNotMatch(launch, /v0\.4\.0/);
  assert.match(changelog, /Completed the previous P0–P4 productization roadmap/);
});
