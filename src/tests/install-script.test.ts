import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("install script help describes the one-script bootstrap flow", () => {
  const scriptPath = path.join(process.cwd(), "install.sh");
  const output = execFileSync("bash", [scriptPath, "--help"], {
    encoding: "utf8"
  });

  assert.match(output, /Install Web Task Agent without git clone\./);
  assert.match(output, /--repo <owner\/name>/);
  assert.match(output, /--ref <branch\|tag>/);
  assert.match(output, /--non-interactive/);
  assert.match(output, /WEB_TASK_AGENT_INSTALL_ROOT/);
});
