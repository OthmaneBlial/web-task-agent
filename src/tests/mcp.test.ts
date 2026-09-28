import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";

interface RpcResponse {
  id: string | number | null;
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
      const pending = typeof response.id === "number" ? this.waiting.get(response.id) : undefined;
      if (typeof response.id === "number" && pending) {
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

  requestBatch(method: string, params: unknown, count: number): Promise<RpcResponse[]> {
    const requests = Array.from({ length: count }, () => {
      const id = this.nextId++;
      const response = new Promise<RpcResponse>((resolve, reject) => {
        this.waiting.set(id, { resolve, reject });
      });
      return { id, response };
    });
    this.child.stdin.write(requests.map(({ id }) => JSON.stringify({ jsonrpc: "2.0", id, method, params })).join("\n") + "\n");
    return Promise.all(requests.map(({ response }) => response));
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

test("local MCP ignores notifications instead of responding to them", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-mcp-notification-"));
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
    await client.request("initialize", {});
    const noResponse = client.waitForUnsolicitedMessage(500);
    client.notify("tools/call", {
      name: "import_result",
      arguments: { input_path: "provider-result.json", output_path: "imports/should-not-exist" }
    });
    await assert.rejects(noResponse, /timed out/);
    assert.ok(resultObject(await client.request("tools/list", {})).tools);
    assert.equal(fs.existsSync(path.join(root, "imports", "should-not-exist")), false);
  } finally {
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local MCP validates request IDs and bounds oversized error responses", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-mcp-invalid-id-"));
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
    await client.request("initialize", {});
    for (const id of [null, 1.5, true]) {
      const responsePromise = client.waitForUnsolicitedMessage();
      client.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list" })}\n`);
      const response = await responsePromise;
      assert.equal(response.id, null);
      assert.equal(response.error?.code, -32600);
      assert.equal(response.result, undefined);
    }

    const oversizedIdResponse = client.waitForUnsolicitedMessage();
    client.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: "x".repeat(257), method: "tools/list" })}\n`);
    const oversizedId = await oversizedIdResponse;
    assert.equal(oversizedId.id, null);
    assert.equal(oversizedId.error?.code, -32600);

    const stringIdResponse = client.waitForUnsolicitedMessage();
    client.child.stdin.write('{"jsonrpc":"2.0","id":"valid-string-id","method":"tools/list"}\n');
    const validStringId = await stringIdResponse;
    assert.equal(validStringId.id, "valid-string-id");
    assert.ok((validStringId.result as Record<string, unknown>).tools);

    const methodPrefixBytes = Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "" }));
    const method = "x".repeat(2 * 1024 * 1024 - methodPrefixBytes);
    const oversizedRequest = JSON.stringify({ jsonrpc: "2.0", id: 7, method });
    assert.equal(Buffer.byteLength(oversizedRequest), 2 * 1024 * 1024);
    const oversizedErrorResponse = client.waitForUnsolicitedMessage();
    client.child.stdin.write(`${oversizedRequest}\n`);
    const boundedError = await oversizedErrorResponse;
    assert.equal(boundedError.error?.code, -32603);
    assert.equal(boundedError.error?.message, "MCP response exceeds the 2 MB limit");
    assert.ok(Buffer.byteLength(`${JSON.stringify(boundedError)}\n`) <= 2 * 1024 * 1024);

    const notificationWithId = client.waitForUnsolicitedMessage();
    client.child.stdin.write('{"jsonrpc":"2.0","id":99,"method":"notifications/initialized"}\n');
    const invalidNotification = await notificationWithId;
    assert.equal(invalidNotification.id, 99);
    assert.equal(invalidNotification.error?.code, -32600);
  } finally {
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local MCP bounds concurrent tool calls and rejects an oversized pending queue", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-mcp-request-limit-"));
  const receiptRoot = path.join(root, "receipts", "minimal");
  fs.mkdirSync(path.dirname(receiptRoot), { recursive: true });
  fs.cpSync(path.resolve("examples", "receipt-spec", "minimal"), receiptRoot, { recursive: true });
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
    await client.request("initialize", {});
    const responses = await client.requestBatch("tools/call", {
      name: "verify_receipt",
      arguments: { path: "receipts/minimal" }
    }, 7);

    assert.equal(responses.filter((response) => response.error?.code === -32000).length, 1);
    assert.equal(responses.filter((response) => response.result !== undefined).length, 6);
    assert.ok(responses.filter((response) => response.result !== undefined).every((response) => {
      const result = resultObject(response);
      return result.isError === false && (result.structuredContent as { valid: boolean }).valid;
    }));
  } finally {
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local MCP pauses input while the client stops reading responses", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-receipt-mcp-backpressure-"));
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
    await client.request("initialize", {});
    client.child.stdout.pause();
    const drainPromise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 500);
      client.child.stdin.once("drain", () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
    const responsesPromise = client.requestBatch("unsupported/method", {}, 20_000);

    assert.equal(await drainPromise, false);
    client.child.stdout.resume();
    const responses = await responsesPromise;
    assert.equal(responses.length, 20_000);
    assert.ok(responses.every((response) => response.error));
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
    assert.equal(((compared.structuredContent as { changes: { provenance: boolean } }).changes).provenance, false);
    assert.deepEqual((compared.structuredContent as { changedContradictionIds: string[] }).changedContradictionIds, []);
    assert.equal((compared.structuredContent as { addedLimitations: number }).addedLimitations, 0);
    assert.equal((compared.structuredContent as { removedLimitations: number }).removedLimitations, 0);
    assert.equal((compared.structuredContent as { nextValidationChanged: boolean }).nextValidationChanged, false);

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

    fs.writeFileSync(path.join(root, "oversized-result.json"), Buffer.alloc(2 * 1024 * 1024 + 1, 0x20));
    const oversizedImport = resultObject(await client.request("tools/call", {
      name: "import_result",
      arguments: { input_path: "oversized-result.json", output_path: "imports/oversized" }
    }));
    assert.equal(oversizedImport.isError, true);
    assert.match(JSON.stringify(oversizedImport.content), /input result exceeds the 2 MB limit/);
    assert.equal(fs.existsSync(path.join(root, "imports", "oversized")), false);

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
