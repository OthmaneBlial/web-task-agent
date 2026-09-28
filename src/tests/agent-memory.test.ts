import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadAgentMemory } from "../lib/agent-memory";

test("agent memory accepts 16 KB and rejects larger files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-memory-"));
  const memoryPath = path.join(root, "agent-memory.md");
  try {
    fs.writeFileSync(memoryPath, Buffer.alloc(16 * 1024, 0x78));
    assert.equal(loadAgentMemory(memoryPath)?.content.length, 16 * 1024);

    fs.writeFileSync(memoryPath, Buffer.alloc(16 * 1024 + 1, 0x78));
    assert.throws(() => loadAgentMemory(memoryPath), /agent memory exceeds the 16 KB limit/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
