# Local Decision Receipt MCP server

`decision-receipt-mcp` is a STDIO-only local server with exactly four tools. The main package exposes the same server as `web-task-agent mcp serve`, which is the entrypoint described by the official registry metadata:

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

The packaged CLI path is equivalent after `npm run build`:

```json
{
  "mcpServers": {
    "decision-receipt": {
      "command": "node",
      "args": ["/absolute/path/to/web-task-agent/dist/entrypoint.js", "mcp", "serve"],
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

That check uses the official MCP client package to spawn the server, initialize it, list the exact tool set, and call `verify_receipt` offline. The unit suite additionally blocks network primitives, tests both STDIO entrypoints, and exercises verify, compare, import, render, path escape, and output bounds.

Registry metadata is checked without a network dependency:

```bash
npm run validate:mcp-registry
```

[`server.json`](server.json) pins the reviewed `2025-12-11` official schema, declares `io.github.othmaneblial/decision-receipt`, and maps the public npm package to the positional arguments `mcp serve`. The root `package.json` ships the matching `mcpName`. A clean-install CI job proves that the packed CLI completes the official client handshake and verifies a receipt from a directory with no checkout dependency.

## Agent recipe

The portable skill at [`.agents/skills/decision-receipt-review/SKILL.md`](.agents/skills/decision-receipt-review/SKILL.md) tells an agent to verify before comparison, keep integrity separate from truth, and refuse sessions, credentials, provider prompts, or external actions.

## Publication boundary

The metadata is ready but is intentionally not presented as registered. The official registry requires the referenced npm version to be public first. On a future protected `v*` tag, the release workflow will:

1. publish the exact tested npm artifact through Trusted Publishing;
2. observe that exact version on the public npm registry;
3. download the pinned `mcp-publisher` binary **on the GitHub runner only**, verify its SHA-256, authenticate with GitHub OIDC, and publish `server.json`.

No MCP publisher, model, or new dependency is installed on the maintainer's Mac. A local build, prepared metadata, or green CI is not public npm/MCP registry proof.
