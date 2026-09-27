# Dependency Upgrade Readiness

## Operator story

A maintainer has a release coming up and receives a proposed dependency update. They need to decide whether to adopt the candidate version, hold it, or replace the dependency while accounting for runtime support, breaking changes, migration work, advisories, and the project's own unrun tests.

This story is an inference from GitHub's [Dependabot review guidance](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-version-updates?learn=dependency_version_updates&learnproduct=code-security), which asks maintainers to review tests, changelogs, and release notes before merging an update. GitHub's [update grouping guidance](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/optimizing-pr-creation-version-updates) also treats major updates separately from grouped minor and patch updates.

## Decision boundary

Input names the package, current and candidate versions, runtime versions, package manager, and release deadline. The result is `adopt`, `hold`, or `replace`, with exact source links, publication dates, affected version ranges, contradictions, and the smallest local build/test/rollback checks still required.

The research can report what upstream sources claim. It cannot certify that the operator's application is compatible or that its local tests pass.

## Invalidation

Reopen the decision if the package version, resolved lockfile graph, package manager, or runtime target changes. Refresh support and advisory evidence when the official source changes or becomes more than 90 days old.

## Difference from the catalog

- `market-entry` and `product-validation` compare market options or demand hypotheses. They do not evaluate a specific dependency version against a named runtime and migration path.
- `content-demand` finds unanswered documentation questions. It does not turn versioned release notes, support schedules, and advisory ranges into a release decision.
- This proposal prefers the dependency maintainer's release and migration docs, official runtime support policy, package metadata, and advisories. Community reports may flag questions but cannot establish compatibility.

## Deterministic fixture

`fixture.json` is synthetic. Its fictional parser 4.0 release removes an API the application still uses and raises its runtime minimum to Node.js 22, while the application is pinned to Node.js 20. Expected result: `hold`, pending migration and local runtime tests. The example uses reserved `.invalid` URLs and asserts no real package facts.

## Validate the proposal

```bash
web-task-agent workflow validate workflows/proposals/dependency-upgrade-readiness/workflow.json
```

This is a proposal and is not registered as an executable catalog workflow. Use the test plan before registering it.
