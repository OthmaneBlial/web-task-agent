import assert from "node:assert/strict";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = process.cwd();
const client = new Client({ name: "decision-receipt-contract-test", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "dist", "mcp", "server.js")],
  cwd: root,
  env: { DECISION_RECEIPT_ROOT: root }
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
    arguments: { path: "examples/receipt-spec/minimal" }
  });
  assert.equal(verification.isError, false);
  assert.equal(verification.structuredContent?.valid, true);
  console.log("Official MCP client handshake, tool discovery, and offline verification passed.");
} finally {
  await client.close();
}
