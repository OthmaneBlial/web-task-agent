# Decision Receipt compatibility

## Supported matrix

| Surface | Version | Reads spec | Writes spec | Status |
| --- | --- | --- | --- | --- |
| JSON Schema | v1 | `1.x` shape | — | implemented |
| Web Task Agent CLI | `0.5.1` + unreleased | `1.x` | `1.0.0` | implemented |
| `@othmaneblial/decision-receipt` | `0.1.x` | `1.x` | helpers target `1.0.0` | implemented, publication pending P3 |
| Local web verifier | live static build | `1.x` | verification report `1.0.0` | published, local-only |
| GitHub Action | `v1.0.0` / maintained `v1` | `1.x` | privacy report `1.0.0` | released, Node 24 |
| Provider-neutral adapter contract | `1.0.0` | `1.0.0` | `1.0.0` | implemented; authentic engine runs pending |
| Local MCP server | protocol `2025-11-25` | receipt `1.x` | receipt `1.0.0` | implemented; npm publication pending |

The table distinguishes code present in this repository from externally published surfaces. “Implemented” does not mean the npm package has been released. The Action vendors the reviewed core from protocol commit `8a871b7`; its release is verified in a [green PR](https://github.com/OthmaneBlial/web-task-agent/pull/9) and a [reproducible red PR](https://github.com/OthmaneBlial/decision-receipt-demo/pull/1).

The adapter fixture currently checked into `examples/interop` is deliberately synthetic and marked `fixture: true`; it proves the contract and import boundary, not interoperability with an authentic Browser Use run. The MCP matrix row is backed by both a network-blocked process test and a handshake through the official TypeScript MCP client.

## Compatibility policy

- Patch versions clarify wording or validation while accepting the same documents.
- Minor versions may add optional fields or enum values. A v1 reader accepts unknown fields, preserves them when canonicalizing a complete receipt, and ignores semantics it does not understand.
- Major versions may change required fields or meaning and require an explicit migration.
- Readers fail closed on unknown major versions. Producers emit the exact current version, `1.0.0`.

## Experimental v1 to spec 1.0.0

Web Task Agent 0.5.1 emitted an experimental `schemaVersion: 1` receipt without `specVersion` or `profile`. Use `migrateDecisionReceipt()` to add the formal identifiers, then regenerate `integrity-manifest.json`.

Experimental signed receipts cannot migrate in place because their earlier insertion-order bytes do not match the v1 canonical form. Remove the experimental signature, migrate, regenerate the manifest, then sign again with an authorized key.

## Runtime and module policy

The core supports Node 20 and later and browser WebCrypto. Its initial build is CommonJS because the main CLI and supported Node matrix consume CommonJS; native ESM can import it through Node interoperability. A dual build is intentionally deferred until an ESM-only consumer demonstrates the need, avoiding two subtly different verification implementations.

The public-package budget is zero runtime dependencies and at most 180 KB unpacked, including schema, conformance cases, types, and examples. CI installs the packed artifact into a clean TypeScript project and exercises validation and diff rendering.
