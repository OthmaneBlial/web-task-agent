import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";

interface RpcResponse {
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

class LocalMcpClient {
  private nextId = 1;
  private readonly waiting = new Map<number, { resolve: (value: RpcResponse) => void; reject: (error: Error) => void }>();
  private readonly unsolicitedMessages: RpcResponse[] = [];
  private unsolicitedWaiter: ((response: RpcResponse) => void) | null = null;
  readonly stderr: string[] = [];
  readonly child: ChildProcessWithoutNullStreams;

  constructor(root: string, networkGuard: string, entrypointArgs = [path.resolve("dist", "mcp", "server.js")]) {
    this.child = spawn(process.execPath, entrypointArgs, {
      cwd: root,
      env: {
        ...process.env,
        DECISION_RECEIPT_ROOT: root,
        NODE_OPTIONS: `--require=${JSON.stringify(networkGuard)}`
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    readline.createInterface({ input: this.child.stdout, crlfDelay: Infinity }).on("line", (line) => {
      const response = JSON.parse(line) as RpcResponse;
      const pending = response.id === null ? undefined : this.waiting.get(response.id);
      if (response.id !== null && pending) {
        this.waiting.delete(response.id);
        pending.resolve(response);
      } else if (this.unsolicitedWaiter) {
        this.unsolicitedWaiter(response);
      } else {
        this.unsolicitedMessages.push(response);
      }
    });
    this.child.stderr.on("data", (chunk) => this.stderr.push(String(chunk)));
    this.child.on("error", (error) => {
      for (const pending of this.waiting.values()) pending.reject(error);
      this.waiting.clear();
    });
  }

  request(method: string, params?: unknown): Promise<RpcResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  waitForUnsolicitedMessage(timeoutMs = 1_000): Promise<RpcResponse> {
    const message = this.unsolicitedMessages.shift();
    if (message) return Promise.resolve(message);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.unsolicitedWaiter = null;
        reject(new Error("timed out waiting for an unsolicited MCP response"));
      }, timeoutMs);
      this.unsolicitedWaiter = (response) => {
        clearTimeout(timeout);
        this.unsolicitedWaiter = null;
        resolve(response);
      };
    });
  }

  notify(method: string, params?: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    if (this.child.exitCode !== null) return;
    await new Promise<void>((resolve) => this.child.once("exit", () => resolve()));
  }
}

test("local MCP rejects an oversized request before its newline arrives", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-mcp-oversized-"));
  const guard = path.join(root, "deny-network.cjs");
  fs.writeFileSync(guard, [
    'const net = require("node:net");',
    'function deny() { throw new Error("unexpected MCP network access"); }',
    'globalThis.fetch = deny;',
    'net.connect = deny;',
    'net.createConnection = deny;'
  ].join("\n"), "utf8");
  const client = new LocalMcpClient(root, guard);
  try {
    const responsePromise = client.waitForUnsolicitedMessage();
    client.child.stdin.write(Buffer.alloc(2 * 1024 * 1024 + 1, 0x78));
    const response = await responsePromise;
    assert.equal(response.id, null);
    assert.equal(response.error?.message, "Request exceeds the 2 MB limit");
    client.child.stdin.write("\n");
    assert.deepEqual(resultObject(await client.request("ping")), {});
  } finally {
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function resultObject(response: RpcResponse): Record<string, unknown> {
  assert.equal(response.error, undefined);
  assert.ok(response.result && typeof response.result === "object");
  return response.result as Record<string, unknown>;
}

test("local MCP exposes exactly four bounded offline receipt tools", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-mcp-"));
  const receiptRoot = path.join(root, "receipts", "minimal");
  fs.mkdirSync(path.dirname(receiptRoot), { recursive: true });
  fs.cpSync(path.resolve("examples", "receipt-spec", "minimal"), receiptRoot, { recursive: true });
  fs.copyFileSync(path.resolve("examples", "interop", "browser-use-result.json"), path.join(root, "provider-result.json"));
  const guard = path.join(root, "deny-network.cjs");
  fs.writeFileSync(guard, [
    'const net = require("node:net");',
    'function deny() { throw new Error("unexpected MCP network access"); }',
    'globalThis.fetch = deny;',
    'net.connect = deny;',
    'net.createConnection = deny;'
  ].join("\n"), "utf8");
  const client = new LocalMcpClient(root, guard);
  try {
    const initialized = resultObject(await client.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "contract-test", version: "1.0.0" }
    }));
    assert.equal(initialized.protocolVersion, "2025-11-25");
    client.notify("notifications/initialized");

    const unsupportedVersion = resultObject(await client.request("initialize", {
      protocolVersion: "2099-01-01",
      capabilities: {},
      clientInfo: { name: "negotiation-test", version: "1.0.0" }
    }));
    assert.equal(unsupportedVersion.protocolVersion, "2025-11-25");

    const listed = resultObject(await client.request("tools/list", {}));
    const tools = listed.tools as Array<{ name: string; annotations: { openWorldHint: boolean } }>;
    assert.deepEqual(tools.map((tool) => tool.name), ["verify_receipt", "compare_receipts", "import_result", "render_receipt"]);
    assert.ok(tools.every((tool) => tool.annotations.openWorldHint === false));
    assert.equal(tools.some((tool) => /browser|shell|cookie|auth/i.test(tool.name)), false);

    const verified = resultObject(await client.request("tools/call", {
      name: "verify_receipt",
      arguments: { path: "receipts/minimal" }
    }));
    assert.equal(verified.isError, false);
    assert.deepEqual(verified.structuredContent, {
      valid: true,
      checkedFiles: 2,
      errors: [],
      truthBoundary: "Integrity is not proof of source, claim, or decision truth."
    });

    const compared = resultObject(await client.request("tools/call", {
      name: "compare_receipts",
      arguments: { earlier_path: "receipts/minimal", later_path: "receipts/minimal", format: "json" }
    }));
    assert.equal((compared.structuredContent as { decisionChanged: boolean }).decisionChanged, false);
    assert.equal((compared.structuredContent as { changedSources: number }).changedSources, 0);

    const rendered = resultObject(await client.request("tools/call", {
      name: "render_receipt",
      arguments: { path: "receipts/minimal", format: "markdown" }
    }));
    assert.match(JSON.stringify(rendered.content), /Integrity verification does not prove/);

    const imported = resultObject(await client.request("tools/call", {
      name: "import_result",
      arguments: { input_path: "provider-result.json", output_path: "imports/browser-use" }
    }));
    assert.equal(imported.isError, undefined);
    assert.equal((imported.structuredContent as { valid: boolean }).valid, true);
    assert.equal(fs.existsSync(path.join(root, "imports", "browser-use", "receipt.json")), true);

    const escaped = resultObject(await client.request("tools/call", {
      name: "verify_receipt",
      arguments: { path: "../outside" }
    }));
    assert.equal(escaped.isError, true);
    assert.match(JSON.stringify(escaped.content), /escapes DECISION_RECEIPT_ROOT/);
    assert.equal(client.stderr.join(""), "");
  } finally {
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("main CLI exposes the same offline MCP server through mcp serve", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-cli-mcp-"));
  const guard = path.join(root, "deny-network.cjs");
  fs.writeFileSync(guard, [
    'const net = require("node:net");',
    'function deny() { throw new Error("unexpected MCP network access"); }',
    'globalThis.fetch = deny;',
    'net.connect = deny;',
    'net.createConnection = deny;'
  ].join("\n"), "utf8");
  const client = new LocalMcpClient(root, guard, [path.resolve("dist", "entrypoint.js"), "mcp", "serve"]);
  try {
    const initialized = resultObject(await client.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "cli-entrypoint-test", version: "1.0.0" }
    }));
    assert.equal(initialized.protocolVersion, "2025-11-25");
    const listed = resultObject(await client.request("tools/list", {}));
    const tools = listed.tools as Array<{ name: string }>;
    assert.deepEqual(tools.map((tool) => tool.name), [
      "verify_receipt",
      "compare_receipts",
      "import_result",
      "render_receipt"
    ]);
    assert.equal(client.stderr.join(""), "");
  } finally {
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
