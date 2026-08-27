# Release build-cache decision

**Question:** Should release CI adopt a shared build cache now?

**Decision:** Adopt only an architecture-scoped cache and keep the speed claim insufficient until measured.

## Claims

| Claim ID | Status | Evidence link | Limitation |
| --- | --- | --- | --- |
| architecture-scoped-keys | supported | evidence-cache-policy → cache-policy (supports) | — |
| cross-architecture-safety | contradicted | evidence-cache-incident → cache-incident (contradicts) | — |
| thirty-percent-faster | insufficient | evidence-cache-context → cache-policy (context) | Neither synthetic source contains measured release-duration data. |

## Sources

### cache-policy — Synthetic build-cache policy

- URL: https://example.com/studies/build-cache-policy
- Collected: 2026-08-20T09:00:00.000Z
- Excerpt: “Cache keys include the dependency lockfile and runner architecture before a release artifact can be restored.”

### cache-incident — Synthetic cache incident note

- URL: https://example.com/studies/build-cache-incident
- Collected: 2024-01-15T09:00:00.000Z
- Excerpt: “A stale cache restored incompatible native binaries after the runner architecture changed.”

## Strongest contradiction

The incident note directly contradicts cross-architecture restore safety.

## Limitations

- All sources and scenarios are synthetic study fixtures.
- Source cache-incident is intentionally stale.
- A Markdown report has no integrity manifest, so unchanged bytes cannot be established from this file alone.

## Smallest next validation

Measure 20 release builds per runner architecture and compare median duration plus cache-related failures.
