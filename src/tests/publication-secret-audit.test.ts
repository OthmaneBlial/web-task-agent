import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("publication secret audit passes without exposing sensitive values", () => {
  const output = execFileSync(process.execPath, ["scripts/audit-publication-secrets.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.match(output, /Publication secret audit scanned \d+ tracked or publishable file\(s\)\./);
  assert.match(output, /Ignored local-state guards present: \.env, \.data\/, reports\//);
  assert.match(output, /No high-confidence secrets found in files Git could publish\./);
  assert.doesNotMatch(output, /Potential secrets were found/);
});
