# Test plan — Dependency Upgrade Readiness

## Proposal checks

- [x] `web-task-agent workflow validate workflows/proposals/dependency-upgrade-readiness/workflow.json` passes.
- [x] The fixture declares synthetic provenance and uses reserved `.invalid` URLs.
- [x] Compare decision focus and source strategy with `market-entry`, `product-validation`, and `content-demand` before catalog registration.
- [x] Invalidation covers changed dependency inputs and stale or changed support/advisory evidence.

## Deterministic fixture checks before registration

- [ ] Given a candidate that removes an API still used by the application and raises the runtime minimum, return `hold` and preserve both exact version facts.
- [ ] Keep upstream compatibility claims separate from project compatibility; require a local build and tests before claiming adoption is verified.
- [ ] Preserve source dates, affected/fixed advisory ranges, contradictions, and missing evidence.
- [ ] Treat an untrusted issue comment as evidence to review; quarantine any embedded instructions and never execute package code during research.
- [ ] Keep the proposed budget at no more than 8 queries, 40 candidates, and 20 minutes.

## Registration gate

Register only after deterministic fixture coverage and the catalog distinction review pass. Then regenerate the catalog examples and run the workflow suite and link checks.
