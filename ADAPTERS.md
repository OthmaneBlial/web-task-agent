# Decision Receipt adapter contract v1

Adapters convert an external engine result into a provider-neutral JSON document before any receipt is written. The contract is defined twice and tested for agreement:

- [JSON Schema Draft 2020-12](schema/decision-receipt-adapter.v1.schema.json) for language-neutral implementations;
- [`validateDecisionReceiptAdapterResult`](src/lib/adapter-contract.ts) for the TypeScript CLI and MCP import boundary.

## Minimal contract

An adapter result contains:

- producer ID/version, external engine/version, run ID, export time, and fixture label;
- decision title, summary, and smallest next validation;
- sources with public credential-free URLs, collection time, excerpts, and roles;
- claims with explicit status and claim-to-source evidence;
- contradictions, limitations, known policy/model metadata;
- an origin on every decision, source, claim, and evidence link.

The four origins are not synonyms:

| Origin | Meaning |
| --- | --- |
| `captured` | Bytes or metadata directly present in the engine output |
| `imported` | Semantics mapped without adding a claim |
| `inferred` | Value derived by adapter logic; an explanatory note is mandatory |
| `operator-attested` | Value supplied or confirmed by a person; an explanatory note is mandatory |

Missing data must not be silently completed. Mark a claim `insufficient`, provide a limitation, or stop the import.

## Forbidden boundary

The validator rejects unknown fields and recursively rejects cookies, sessions, credentials, authenticated headers, tokens, prompts, scripts, tool calls, and similar provider-private or executable payloads. It also applies the repository's URL policy, requires explicit evidence links, limits 100 sources/250 claims/50 evidence references per claim, and bounds MCP input to 2 MB.

## Create and test an adapter

```bash
npm run build
node dist/cli.js receipt adapter create my-engine \
  --engine "My Engine" \
  --engine-version "1.2.3" \
  --output adapters/my-engine

node adapters/my-engine/adapter.mjs adapters/my-engine/fixture.raw.json \
  > adapters/my-engine/output.json
node dist/cli.js receipt adapter validate adapters/my-engine/output.json
node dist/cli.js receipt import adapters/my-engine/output.json --output reports/imports/my-engine
node dist/cli.js receipt verify reports/imports/my-engine
```

The scaffold is a strict pass-through mapper and includes a clearly synthetic raw fixture. Replace it with a redistributable engine output, record the exact command/version, and preserve limitations. The shared tests generate a scaffold in a temporary directory, execute it, validate it independently, import it, and refuse overwrite.

The existing `examples/interop/browser-use-result.json` remains a synthetic contract fixture and now says so in machine-readable provenance. It is not one of the two authentic external runs required by P4.
