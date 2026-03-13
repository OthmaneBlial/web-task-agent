import fs from "node:fs";
import path from "node:path";

export interface AgentMemorySnapshot {
  path: string;
  content: string;
}

const DEFAULT_MEMORY_FILES = ["agent-memory.md", "agent-memory.txt"];

export function loadAgentMemory(customPath?: string): AgentMemorySnapshot | null {
  const candidates = customPath
    ? [path.resolve(customPath)]
    : DEFAULT_MEMORY_FILES.map((filePath) => path.resolve(process.cwd(), filePath));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const content = fs.readFileSync(candidate, "utf8").trim();
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
