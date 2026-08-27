# Local Decision Receipt MCP server

`decision-receipt-mcp` is a STDIO-only local server with exactly four tools:

| Tool | Capability | Writes |
| --- | --- | --- |
| `verify_receipt` | Verify structure, references, hashes, and optional signature | No |
| `compare_receipts` | Verify two receipts and separate six change categories | No |
| `import_result` | Convert a provider-neutral local JSON result into a receipt directory | Yes, inside the configured root |
| `render_receipt` | Render a verified receipt as Markdown or JSON | No |

It has no navigation, HTTP, browser, shell, cookie, authentication, or external-write tool. Paths are relative to `DECISION_RECEIPT_ROOT`; escapes and symbolic links are rejected. Requests and responses are bounded to 2 MB.

## Install from this checkout

Until the public npm owner gate is completed, build the versioned checkout and use its absolute paths:

```bash
npm ci
npm run build
```

Add the server to any STDIO-compatible MCP host using the equivalent of:

```json
{
  "mcpServers": {
    "decision-receipt": {
      "command": "node",
      "args": ["/absolute/path/to/web-task-agent/dist/mcp/server.js"],
      "env": {
        "DECISION_RECEIPT_ROOT": "/absolute/path/to/the/authorized/workspace"
      }
    }
  }
}
```

The host owns the subprocess and performs the MCP initialize handshake. Never launch the server in a terminal and then paste protocol messages around it; stdout is reserved for newline-delimited JSON-RPC.

## Verify compatibility

```bash
npm run test:mcp-sdk
```

That check uses the official MCP client package to spawn the server, initialize it, list the exact tool set, and call `verify_receipt` offline. The unit suite additionally blocks network primitives and exercises verify, compare, import, render, path escape, and output bounds.

## Agent recipe

The portable skill at [`.agents/skills/decision-receipt-review/SKILL.md`](.agents/skills/decision-receipt-review/SKILL.md) tells an agent to verify before comparison, keep integrity separate from truth, and refuse sessions, credentials, provider prompts, or external actions.

Official MCP registry metadata is intentionally deferred until the underlying npm package is public. A local build is not registry-publication proof.
