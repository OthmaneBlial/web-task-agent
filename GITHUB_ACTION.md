# Decision Receipt GitHub Action

Add offline integrity and review gates to a repository with no secret and read-only permissions:

```yaml
- uses: OthmaneBlial/decision-receipt-action@v1
  with:
    path: decisions/**/*.receipt.json
```

The Action verifies receipt structure, internal references, source snapshot hashes, manifest hashes and byte counts, optional Ed25519 signatures, freshness, contradictions, and insufficient claims. Its default path writes annotations, a Step Summary, outputs, and a privacy-minimized report without making a network request.

- [Action repository and security model](https://github.com/OthmaneBlial/decision-receipt-action)
- [Green main run and reproducible red PR](https://github.com/OthmaneBlial/decision-receipt-demo)
- [Local no-upload verifier](https://othmaneblial.github.io/web-task-agent/verify.html)

Use `compare-to` when the workflow checks out a trusted baseline and the current glob resolves to one receipt. The resulting diff exposes change categories, counts, and claim IDs, while omitting claim text, excerpts, source titles, snapshots, and URLs.

Integrity is not truth. A passing hash proves reviewed bytes did not change; it does not prove that a source, claim, or decision is true, complete, authorized, representative, or fresh.
