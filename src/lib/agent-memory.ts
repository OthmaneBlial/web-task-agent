import fs from "node:fs";
import path from "node:path";

import { readBoundedTextFileSync } from "./bounded-file";

export interface AgentMemorySnapshot {
  path: string;
  content: string;
}

const DEFAULT_MEMORY_FILES = ["agent-memory.md", "agent-memory.txt"];
const MAX_AGENT_MEMORY_BYTES = 16 * 1024;

export function loadAgentMemory(customPath?: string): AgentMemorySnapshot | null {
  const candidates = customPath
    ? [path.resolve(customPath)]
    : DEFAULT_MEMORY_FILES.map((filePath) => path.resolve(process.cwd(), filePath));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const content = readBoundedTextFileSync(candidate, "agent memory", MAX_AGENT_MEMORY_BYTES).trim();
    if (!content) {
      continue;
    }

    return {
      path: candidate,
      content
    };
  }

  return null;
}
