import fs from "node:fs";
import path from "node:path";

import { ensureDir } from "./cache";
import { redactSensitiveText, redactSensitiveValue } from "./redaction";

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogEntry {
  timestamp: string;
  level: StructuredLogLevel;
  scope: string;
  message: string;
  details?: unknown;
}

export function resolveStructuredLogPath(): string {
  return path.join(process.cwd(), ".data", "logs", "web-task-agent.jsonl");
}

export function appendStructuredLog(entry: StructuredLogEntry, logPath = resolveStructuredLogPath()): void {
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, `${JSON.stringify(redactSensitiveValue(entry))}\n`, "utf8");
}

export function logStructured(
  scope: string,
  message: string,
  level: StructuredLogLevel = "info",
  details?: unknown
): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message: redactSensitiveText(message),
    ...(details === undefined ? {} : { details: redactSensitiveValue(details) })
  };

  appendStructuredLog(entry);
  return entry;
}
