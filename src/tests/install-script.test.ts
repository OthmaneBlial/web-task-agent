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

test("install script upgrades files without deleting local app data", () => {
  const scriptPath = path.join(process.cwd(), "install.sh");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-install-preserve-"));
  const fixtureRoot = path.join(tempDir, "source");
  const fakeBin = path.join(tempDir, "bin");
  const installRoot = path.join(tempDir, "install");
  const appDir = path.join(installRoot, "app");
  const stateDir = path.join(installRoot, "state");
  const archivePath = path.join(tempDir, "source.tar.gz");
  const dataPath = path.join(stateDir, "data", "jobs.sqlite");
  try {
    fs.mkdirSync(path.join(fixtureRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(fakeBin), { recursive: true });
    fs.mkdirSync(path.join(appDir), { recursive: true });
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "package.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(fixtureRoot, "src", "version.txt"), "new version\n", "utf8");
    execFileSync("tar", ["-czf", archivePath, "-C", fixtureRoot, "."]);
    fs.writeFileSync(path.join(appDir, ".env"), "ANTHROPIC_API_KEY=keep-me\n", "utf8");
    fs.writeFileSync(path.join(appDir, "operator-file.txt"), "keep this file\n", "utf8");
    fs.writeFileSync(dataPath, "keep this database\n", "utf8");
    fs.symlinkSync(path.join(stateDir, "data"), path.join(appDir, ".data"), "dir");

    const fakeCommands = {
      curl: "#!/bin/sh\nwhile [ \"$#\" -gt 0 ]; do\n  if [ \"$1\" = \"-o\" ]; then cp \"$WEB_TASK_AGENT_TEST_ARCHIVE\" \"$2\"; exit 0; fi\n  shift\ndone\nexit 2\n",
      node: "#!/bin/sh\nprintf '22.12.0\\n'\n",
      npm: "#!/bin/sh\nexit 0\n"
    };
    for (const [name, content] of Object.entries(fakeCommands)) {
      const commandPath = path.join(fakeBin, name);
      fs.writeFileSync(commandPath, content, "utf8");
      fs.chmodSync(commandPath, 0o755);
    }

    const result = spawnSync("bash", [scriptPath, "--non-interactive", "--skip-llm-setup"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
        WEB_TASK_AGENT_TEST_ARCHIVE: archivePath,
        WEB_TASK_AGENT_FORCE_SYSTEM_NODE: "1",
        WEB_TASK_AGENT_INSTALL_ROOT: installRoot,
        WEB_TASK_AGENT_APP_DIR: appDir,
        WEB_TASK_AGENT_STATE_DIR: stateDir,
        WEB_TASK_AGENT_RUNTIME_DIR: path.join(installRoot, "runtime"),
        WEB_TASK_AGENT_BIN_DIR: path.join(tempDir, "bin-output")
      }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(appDir, ".env"), "utf8"), "ANTHROPIC_API_KEY=keep-me\n");
    assert.equal(fs.readFileSync(path.join(appDir, "operator-file.txt"), "utf8"), "keep this file\n");
    assert.equal(fs.readFileSync(path.join(appDir, "src", "version.txt"), "utf8"), "new version\n");
    assert.equal(fs.readFileSync(dataPath, "utf8"), "keep this database\n");
    assert.equal(fs.realpathSync(path.join(appDir, ".data")), fs.realpathSync(path.join(stateDir, "data")));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
