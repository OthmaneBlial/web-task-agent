import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
  assert.match(output, /--skip-llm-setup/);
  assert.match(output, /system Node\.js installation \(22\.12 or newer\)/);
  assert.match(output, /WEB_TASK_AGENT_INSTALL_ROOT/);
});

test("install script rejects system Node below the Commander 15 minimum", () => {
  const scriptPath = path.join(process.cwd(), "install.sh");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-node-version-"));
  const nodePath = path.join(tempDir, "node");

  try {
    fs.writeFileSync(nodePath, "#!/bin/sh\nprintf '22.11.0\\n'\n", "utf8");
    fs.chmodSync(nodePath, 0o755);
    const result = spawnSync("bash", [scriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${tempDir}${path.delimiter}${process.env.PATH ?? ""}`,
        WEB_TASK_AGENT_FORCE_SYSTEM_NODE: "1"
      }
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Node\.js 22\.12 or newer is required/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
