# Independent security review brief

This is the public review scope for Decision Receipt v1. It distinguishes maintainer tests from independent review and gives reviewers a bounded, reproducible target. Suspected vulnerabilities must be reported through the private process in [SECURITY.md](SECURITY.md), not a public issue.

## Review target

Review a named commit of `OthmaneBlial/web-task-agent`; do not review a moving branch without recording the final SHA. The high-value surfaces are:

1. JSON Schema and runtime-validator agreement;
2. canonical JSON, integrity hashing, Ed25519 signing, and migration;
3. ZIP expansion limits, root stripping, traversal/symlink assumptions, and receipt-relative paths;
4. unsafe or credential-bearing source URLs and imported provider data;
5. HTML escaping and untrusted text rendering in the CLI and browser verifier;
6. secret exclusion, no-network verification, no telemetry, and local-only browser behavior.

The local research runner, configured model providers, arbitrary authenticated browsing, and factual correctness of sources are outside the Decision Receipt security claim unless a reviewer explicitly expands the scope.

## Reproduction baseline

```bash
npm ci
npm test
npm run audit:secrets
npm run audit:prod
npm run release:check
```

Reviewers should also open the local verifier with network recording enabled, load the valid/tampered/changed fixtures, block the server after initial load, and inspect browser storage and console output. Record browser/OS versions and the reviewed commit.

## What maintainers have tested

| Surface | Current repository evidence |
| --- | --- |
| Schema/runtime agreement | independent Ajv suite plus runtime conformance cases |
| Tamper and signature failures | deterministic invalid hash and signature-mismatch cases |
| Archive input | compressed, per-file, extracted-size, file-count, root, and traversal limits |
| HTML and URL safety | escaping tests and public HTTPS credential-free URL policy |
| Secrets | publication scan over Git-tracked/publishable files and ignored local-state guards |
| Local verifier | folder/ZIP fixtures, diff, keyboard/mobile checks, no persistent storage, offline-after-load manual QA |
| External engines | two privacy-safe, unauthenticated imports with explicit limitations |

These are maintainer-produced checks, not an independent assessment, penetration test, formal proof, or guarantee of factual truth.

## What has not been independently tested

- no external reviewer has yet signed off on the six high-value surfaces;
- no formal cryptographic proof or cross-language canonicalization implementation has been audited;
- no large fuzzing campaign, hostile browser-extension test, or authenticated enterprise environment is claimed;
- no review covers every third-party browser/model/provider behavior;
- no security SLA, bug bounty, or compliance certification is offered.

## Expected public result

After coordinated handling of sensitive findings, publish the reviewed commit, reviewer identity or stated anonymity, methods, surfaces covered, findings by severity, fixes and regression tests, unresolved limits, and date. A clean review means only “no issue found in this scope and effort,” never “secure” without qualification.
