import fs from "node:fs";
import path from "node:path";

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
  fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(
    logPath,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_APPEND |
      (fs.constants.O_NOFOLLOW ?? 0) |
      (fs.constants.O_NONBLOCK ?? 0),
    0o600
  );
  try {
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile() || (process.platform !== "win32" && stats.nlink > 1)) {
      throw new Error(`refusing unsafe structured log file: ${logPath}`);
    }
    if (process.platform !== "win32") fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(redactSensitiveValue(entry))}\n`, "utf8");
  } finally {
    fs.closeSync(descriptor);
  }
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
