import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeJsonAtomic } from "../lib/cache";

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
