# `@othmaneblial/decision-receipt`

Dependency-free schema, validation, integrity verification, comparison, and rendering for portable AI-research Decision Receipts.

The package does not browse, call a model, open a database, upload evidence, or emit telemetry. It accepts in-memory JSON and file bytes. The Web Task Agent CLI is one producer and consumer of this contract; it is not required to use the core.

## API

```ts
import {
  validateDecisionReceipt,
  verifyReceiptBundle,
  compareDecisionReceipts,
  renderDecisionReceiptComparison,
  migrateDecisionReceipt,
  runDecisionReceiptConformance
} from "@othmaneblial/decision-receipt";

const validation = validateDecisionReceipt(JSON.parse(receiptJson));
const verification = await verifyReceiptBundle({
  "receipt.json": receiptJson,
  "integrity-manifest.json": manifestJson,
  "evidence/snapshots/source.md": snapshotBytes
});
```

`valid: true` means the structure, internal references, available snapshots, declared hashes, byte counts, and optional signature were consistent. It does not mean that a source or decision is true, complete, authorized, or fresh.

## No-key CLI

After the public P3 release, verify a bundle without installing a browser, model, database, or provider SDK:

```bash
npx @othmaneblial/decision-receipt verify ./receipt-bundle
npx @othmaneblial/decision-receipt compare ./before ./after
```

Until the registry publication gate is complete, use the release tarball or this repository checkout; do not treat the command above as live-registry proof.

## Compatibility

| Spec | Package | Profiles | Status |
| --- | --- | --- | --- |
| `1.0.0` | `0.1.x` | `minimal`, `full` | Current |

The SDK reads compatible `1.x` receipts and writes `1.0.0`. Unknown major versions fail explicitly. Additive fields require a spec-minor update; breaking semantics require a spec-major update and a documented migration. The repository's [compatibility matrix](../../COMPATIBILITY.md) records every surface separately.

`migrateDecisionReceipt()` upgrades the unsigned experimental schema-v1 receipt emitted before the formal spec. It refuses unknown versions and signed experimental receipts rather than pretending their signature bytes can be preserved.

## Conformance

The versioned recipes in `conformance/cases.json` cover valid, malformed, tampered, unsafe-path, unknown-version, and signature-mismatch behavior. The repository also runs the JSON Schema independently with Ajv; that check imports neither the core nor the CLI. From the repository root:

```bash
npm run test:conformance
```

The same runner is exported as `runDecisionReceiptConformance(cases, bundleFactory)` for other TypeScript implementations. Complete example bundles cover minimal, full, contradicted, incomplete, stale, signed, and tampered receipts under `examples/`.

## Distribution budget

- zero runtime dependencies;
- Node 20+ and browser WebCrypto;
- CommonJS with Node ESM interoperability for the initial support matrix;
- no browser, model, database, network, telemetry, or provider code;
- at most 180 KB unpacked, verified from the actual npm tarball in CI.
