# Interoperability fixture

This **synthetic** fixture exercises the provider-neutral adapter v1 contract using Browser Use as a named format example. It is not a live or authentic Browser Use execution. Every synthetic value is labeled `operator-attested`, and the generated receipt remains `fixture: true`.

The adapter accepts claims, source metadata, excerpts, limitations, explicit origins, and a next validation. It rejects browser sessions, cookies, credentials, prompts, executable instructions, tool calls, and unknown fields.

## Import it

```bash
npm run build
node dist/cli.js receipt adapter validate examples/interop/browser-use-result.json
node dist/cli.js receipt import examples/interop/browser-use-result.json \
  --output /tmp/web-task-agent-import
node dist/cli.js receipt verify /tmp/web-task-agent-import
```

The generated directory contains a `receipt.json`, source snapshots, and `integrity-manifest.json`. Its provenance is `imported` and its fixture flag stays true, so a valid receipt does not claim a real provider run or that any source is true, complete, authorized, or fresh.

The checked-in [imported receipt](imported-receipt/receipt.json) is generated from the same input by `npm run generate:interop` and is used as a compatibility fixture.
