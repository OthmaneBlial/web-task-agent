#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import {
  compareDecisionReceipts,
  importExternalDecisionResult,
  renderDecisionReceiptComparison,
  verifyReceiptDirectory,
  type DecisionReceipt,
  type ExternalDecisionResult
} from "../lib/receipt";

const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2025-11-25";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface ToolCallParams {
  name?: unknown;
  arguments?: unknown;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("arguments must be a JSON object");
  return value as Record<string, unknown>;
}

function stringArgument(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function optionalBoolean(args: Record<string, unknown>, name: string): boolean {
  const value = args[name];
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function workspaceRoot(): string {
  return path.resolve(process.env.DECISION_RECEIPT_ROOT || process.cwd());
}

function localPath(relative: string): string {
  if (relative.includes("\0")) throw new Error("paths cannot contain null bytes");
  const root = workspaceRoot();
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`path escapes DECISION_RECEIPT_ROOT: ${relative}`);
  let current = root;
  for (const segment of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`symbolic links are not allowed in MCP paths: ${relative}`);
  }
  return resolved;
}

function verifiedReceipt(directory: string): DecisionReceipt {
  const verification = verifyReceiptDirectory(localPath(directory));
  if (!verification.valid || !verification.receipt) throw new Error(`receipt verification failed: ${verification.errors.join("; ")}`);
  return verification.receipt;
}

function renderReceipt(receipt: DecisionReceipt, format: "markdown" | "json"): string {
  if (format === "json") return `${JSON.stringify(receipt, null, 2)}\n`;
  return [
    `# ${receipt.decision.title}`,
    "",
    receipt.decision.summary,
    "",
    `- Generated: ${receipt.generatedAt}`,
    `- Spec: ${receipt.specVersion}`,
    `- Provenance: ${receipt.provenance.kind}`,
    `- Claims: ${receipt.claims.length}`,
    `- Sources: ${receipt.sources.length}`,
    "",
    "## Claims",
    "",
    ...receipt.claims.map((claim) => `- **${claim.status}** · \`${claim.id}\` · ${claim.text}`),
    "",
    "## Limitations",
    "",
    ...receipt.limitations.map((limitation) => `- ${limitation}`),
    "",
    "## Next validation",
    "",
    receipt.nextValidation,
    "",
    "> Integrity verification does not prove that a source, claim, or decision is true."
  ].join("\n");
}

function boundedText(text: string): string {
  if (Buffer.byteLength(text, "utf8") > MAX_RESULT_BYTES) throw new Error("tool result exceeds the 2 MB local response limit");
  return text;
}

function toolDefinitions(): unknown[] {
  const pathProperty = { type: "string", minLength: 1, description: "Path relative to DECISION_RECEIPT_ROOT; symbolic links and escapes are rejected." };
  return [
    {
      name: "verify_receipt",
      description: "Verify a local Decision Receipt directory offline. Integrity is not proof of truth.",
      inputSchema: { type: "object", additionalProperties: false, properties: { path: pathProperty }, required: ["path"] },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: "compare_receipts",
      description: "Verify and compare two local Decision Receipts without network access.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          earlier_path: pathProperty,
          later_path: pathProperty,
          format: { type: "string", enum: ["markdown", "json"], default: "markdown" }
        },
        required: ["earlier_path", "later_path"]
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: "import_result",
      description: "Convert one provider-neutral local JSON result into a Decision Receipt directory. Never imports cookies, sessions, provider prompts, or executable instructions.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { input_path: pathProperty, output_path: pathProperty, force: { type: "boolean", default: false } },
        required: ["input_path", "output_path"]
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    {
      name: "render_receipt",
      description: "Verify and render a local Decision Receipt as Markdown or JSON without HTML execution.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { path: pathProperty, format: { type: "string", enum: ["markdown", "json"], default: "markdown" } },
        required: ["path"]
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }
  ];
}

async function callTool(paramsValue: unknown): Promise<Record<string, unknown>> {
  const params = objectValue(paramsValue) as ToolCallParams;
  if (typeof params.name !== "string") throw new Error("tool name is required");
  const args = objectValue(params.arguments ?? {});
  let text: string;
  let structuredContent: Record<string, unknown>;

  if (params.name === "verify_receipt") {
    const directory = localPath(stringArgument(args, "path"));
    const result = verifyReceiptDirectory(directory);
    structuredContent = { valid: result.valid, checkedFiles: result.checkedFiles, errors: result.errors, truthBoundary: "Integrity is not proof of source, claim, or decision truth." };
    text = result.valid
      ? `Decision Receipt integrity verified (${result.checkedFiles} files). Integrity is not proof of truth.`
      : `Decision Receipt verification failed:\n${result.errors.map((error) => `- ${error}`).join("\n")}`;
    return { content: [{ type: "text", text: boundedText(text) }], structuredContent, isError: !result.valid };
  }

  if (params.name === "compare_receipts") {
    const earlier = verifiedReceipt(stringArgument(args, "earlier_path"));
    const later = verifiedReceipt(stringArgument(args, "later_path"));
    const formatValue = args.format ?? "markdown";
    if (formatValue !== "markdown" && formatValue !== "json") throw new Error("format must be markdown or json");
    const comparison = compareDecisionReceipts(earlier, later);
    text = renderDecisionReceiptComparison(comparison, formatValue);
    structuredContent = {
      decisionChanged: comparison.decisionChanged,
      changes: comparison.changes,
      newSources: comparison.newSources.length,
      disappearedSources: comparison.disappearedSources.length,
      changedClaimIds: comparison.changedClaims.map((claim) => claim.id)
    };
  } else if (params.name === "import_result") {
    const inputPath = localPath(stringArgument(args, "input_path"));
    const outputPath = localPath(stringArgument(args, "output_path"));
    if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) throw new Error("input_path must name an existing JSON file");
    if (fs.statSync(inputPath).size > MAX_REQUEST_BYTES) throw new Error("input result exceeds the 2 MB limit");
    const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8")) as ExternalDecisionResult;
    const written = importExternalDecisionResult({ result: parsed, outputDir: outputPath, force: optionalBoolean(args, "force") });
    const verification = verifyReceiptDirectory(outputPath);
    if (!verification.valid) throw new Error(`imported receipt failed verification: ${verification.errors.join("; ")}`);
    structuredContent = {
      receiptPath: path.relative(workspaceRoot(), written.receiptPath),
      integrityManifestPath: path.relative(workspaceRoot(), written.integrityManifestPath),
      snapshots: written.snapshotPaths.length,
      valid: true
    };
    text = `Imported and verified a local Decision Receipt with ${written.snapshotPaths.length} snapshot(s).`;
  } else if (params.name === "render_receipt") {
    const formatValue = args.format ?? "markdown";
    if (formatValue !== "markdown" && formatValue !== "json") throw new Error("format must be markdown or json");
    const receipt = verifiedReceipt(stringArgument(args, "path"));
    text = renderReceipt(receipt, formatValue);
    structuredContent = { specVersion: receipt.specVersion, claims: receipt.claims.length, sources: receipt.sources.length, format: formatValue };
  } else {
    throw new Error(`unknown tool: ${params.name}`);
  }

  return { content: [{ type: "text", text: boundedText(text) }], structuredContent };
}

function writeMessage(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: JsonRpcId, value: unknown): void {
  writeMessage({ jsonrpc: "2.0", id, result: value });
}

function error(id: JsonRpcId, code: number, message: string): void {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  const id = request.id ?? null;
  if (request.method === "initialize") {
    result(id, {
      // MCP asks a server to return a version it actually supports when the
      // client's requested version is unknown. Never echo an unimplemented
      // version merely to make negotiation appear successful.
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "decision-receipt", version: SERVER_VERSION },
      instructions: "Use only local receipt paths. Verify before compare or render. Integrity is not proof of truth. The server has no browser, shell, authentication, cookie, or network tool."
    });
    return;
  }
  if (request.method === "ping") {
    result(id, {});
    return;
  }
  if (request.method === "tools/list") {
    result(id, { tools: toolDefinitions() });
    return;
  }
  if (request.method === "tools/call") {
    try {
      result(id, await callTool(request.params));
    } catch (toolError) {
      const message = toolError instanceof Error ? toolError.message : String(toolError);
      result(id, { content: [{ type: "text", text: message }], isError: true });
    }
    return;
  }
  if (request.method.startsWith("notifications/")) return;
  if (request.id !== undefined) error(id, -32601, `Method not found: ${request.method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
input.on("line", (line) => {
  if (!line.trim()) return;
  if (Buffer.byteLength(line, "utf8") > MAX_REQUEST_BYTES) {
    error(null, -32600, "Request exceeds the 2 MB limit");
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    error(null, -32700, "Parse error");
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    error(null, -32600, "Invalid Request");
    return;
  }
  const request = parsed as Partial<JsonRpcRequest>;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    error(request.id ?? null, -32600, "Invalid Request");
    return;
  }
  void handleRequest(request as JsonRpcRequest).catch((requestError) => {
    error(request.id ?? null, -32603, requestError instanceof Error ? requestError.message : String(requestError));
  });
});
