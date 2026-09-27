import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createOrResumeState,
  loadTaskState,
  saveTaskState,
  writeBufferAtomic,
  writeJsonAtomic,
  writeTextAtomic
} from "../lib/cache";

test("atomic JSON writes do not follow a predictable temporary-file symlink", (context) => {
  if (process.platform === "win32") {
    context.skip("file symlink creation may require elevated privileges on Windows");
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-cache-"));
  const targetPath = path.join(tempDir, "state.json");
  const protectedPath = path.join(tempDir, "protected.txt");

  try {
    fs.writeFileSync(protectedPath, "keep this file", "utf8");
    fs.symlinkSync(protectedPath, `${targetPath}.tmp`);

    writeJsonAtomic(targetPath, { saved: true });

    assert.deepEqual(JSON.parse(fs.readFileSync(targetPath, "utf8")), { saved: true });
    assert.equal(fs.readFileSync(protectedPath, "utf8"), "keep this file");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("atomic text write failure preserves the existing destination", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-cache-text-"));
  const targetPath = path.join(tempDir, "report.md");
  const markerPath = path.join(targetPath, "preserved.txt");

  try {
    fs.mkdirSync(targetPath);
    fs.writeFileSync(markerPath, "keep this file", "utf8");

    assert.throws(() => writeTextAtomic(targetPath, "new report"));
    assert.equal(fs.readFileSync(markerPath, "utf8"), "keep this file");
    assert.deepEqual(fs.readdirSync(tempDir), ["report.md"]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("atomic binary writes preserve byte contents", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-cache-binary-"));
  const targetPath = path.join(tempDir, "image.png");
  const contents = Buffer.from([0, 255, 137, 80, 78, 71, 13, 10, 26, 10]);

  try {
    writeBufferAtomic(targetPath, contents);
    assert.deepEqual(fs.readFileSync(targetPath), contents);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("cache loading rejects invalid envelopes and keeps raw legacy states readable", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-cache-envelope-"));
  const cachePath = path.join(tempDir, "state.json");

  try {
    saveTaskState("agent", cachePath, { runId: "saved-run" });
    const envelope = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Record<string, unknown>;
    envelope.runId = "different-run";
    fs.writeFileSync(cachePath, JSON.stringify(envelope), "utf8");

    assert.throws(() => loadTaskState<{ runId: string }>(cachePath), /run ID/i);

    envelope.version = 2;
    envelope.runId = "saved-run";
    fs.writeFileSync(cachePath, JSON.stringify(envelope), "utf8");
    assert.throws(() => loadTaskState<{ runId: string }>(cachePath), /unsupported cache envelope version/i);

    const legacyState = { runId: "legacy-run", marker: "preserved" };
    fs.writeFileSync(cachePath, JSON.stringify(legacyState), "utf8");
    assert.deepEqual(loadTaskState<typeof legacyState>(cachePath), legacyState);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resume rejects a cache envelope saved for a different task", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-cache-task-"));
  const cachePath = path.join(tempDir, "state.json");

  try {
    saveTaskState("agent", cachePath, { runId: "saved-run" });
    const originalCache = fs.readFileSync(cachePath, "utf8");

    assert.throws(
      () =>
        createOrResumeState({
          task: "github",
          resume: true,
          cachePath,
          createInitialState: () => ({ runId: "new-run" })
        }),
      /task type/i
    );
    assert.equal(fs.readFileSync(cachePath, "utf8"), originalCache);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
