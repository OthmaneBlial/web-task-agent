# Decision Receipt GitHub Actions workflow

This repository keeps its Decision Receipt integrity gate inside `web-task-agent`. It does not depend on a separately maintained repository.

The checked-in [workflow](.github/workflows/decision-receipt.yml) uses read-only permissions and no secret. It installs the reviewed lockfile, builds the local verifier, verifies the valid fixture, and proves that the tampered fixture is rejected:

```yaml
- run: npm ci
- run: npm run build
- run: node dist/entrypoint.js receipt verify examples/receipt-spec/minimal
```

The same command can target any receipt directory after checkout. Verification covers receipt structure, internal references, source snapshot hashes, manifest hashes and byte counts, and optional Ed25519 signatures. The default path stays offline after the repository and npm dependencies have been downloaded.

- [Built-in workflow](.github/workflows/decision-receipt.yml)
- [Valid and tampered fixtures](examples/receipt-spec)
- [Local no-upload verifier](https://othmaneblial.github.io/web-task-agent/verify.html)

Integrity is not truth. A passing hash proves reviewed bytes did not change; it does not prove that a source, claim, or decision is true, complete, authorized, representative, or fresh.
