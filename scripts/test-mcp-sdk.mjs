import assert from "node:assert/strict";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = process.cwd();
const serverCwd = path.resolve(process.env.MCP_SERVER_CWD || root);
const serverCommand = process.env.MCP_SERVER_COMMAND || process.execPath;
const serverArgs = process.env.MCP_SERVER_ARGS
  ? JSON.parse(process.env.MCP_SERVER_ARGS)
  : [path.join(root, "dist", "mcp", "server.js")];
const verifyPath = process.env.MCP_VERIFY_PATH || "examples/receipt-spec/minimal";
assert.ok(Array.isArray(serverArgs) && serverArgs.every((value) => typeof value === "string"));
const client = new Client({ name: "decision-receipt-contract-test", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: serverCommand,
  args: serverArgs,
  cwd: serverCwd,
  env: { ...process.env, DECISION_RECEIPT_ROOT: serverCwd }
});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name), [
    "verify_receipt",
    "compare_receipts",
    "import_result",
    "render_receipt"
  ]);
  const verification = await client.callTool({
    name: "verify_receipt",
    arguments: { path: verifyPath }
  });
  assert.equal(verification.isError, false);
  assert.equal(verification.structuredContent?.valid, true);
  console.log("Official MCP client handshake, tool discovery, and offline verification passed.");
} finally {
  await client.close();
}
