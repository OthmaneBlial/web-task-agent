# Interoperability fixture

This fixture represents a provider-neutral result exported by a browser-research tool. The adapter accepts claims, source metadata, excerpts, limitations, and a next validation; it does not import browser sessions, cookies, prompts, or execute provider instructions.

## Import it

```bash
npm run build
node dist/cli.js receipt import examples/interop/browser-use-result.json \
  --output /tmp/web-task-agent-import
node dist/cli.js receipt verify /tmp/web-task-agent-import
```

The generated directory contains a `receipt.json`, source snapshots, and `integrity-manifest.json`. Its provenance is `imported`, so a valid receipt does not claim that the provider's source is true, complete, authorized, or fresh.

The checked-in [imported receipt](imported-receipt/receipt.json) is generated from the same input by `npm run generate:interop` and is used as a compatibility fixture.
