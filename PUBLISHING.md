# Public npm publishing

The repository can build and prove both public packages without credentials. The first registry publication remains an owner gate because npm must know which account owns each name before its trusted publisher can be configured.

## Packages and tags

| Package | Source | Release tag |
| --- | --- | --- |
| `web-task-agent` | repository root | `v<package-version>` |
| `@othmaneblial/decision-receipt` | `packages/decision-receipt` | `decision-receipt-v<package-version>` |

Both tags invoke `.github/workflows/publish-npm.yml`. The workflow runs on GitHub-hosted Node 24, upgrades to npm 11.5.1 or newer, requests only `contents: read` and `id-token: write`, tests the exact packed tarball in a clean directory, and calls `npm publish` without a token. npm trusted publishing generates provenance automatically.

For the root `web-task-agent` package, that same protected-tag job also waits until the exact version is visible on the public npm registry, then publishes [`server.json`](server.json) to the official MCP registry. The `mcp-publisher` executable is pinned to `v1.8.1`, downloaded only on the ephemeral GitHub runner, checked against its committed SHA-256, and authenticated with GitHub OIDC. Manual workflow rehearsals publish neither npm nor MCP metadata.

## One-time owner gate

Do not add `NPM_TOKEN` or another long-lived publish secret.

1. Sign in to npm as the owner of the `othmaneblial` scope.
2. Reserve or initially publish each public package if npm requires ownership establishment.
3. In each package's npm settings, add a GitHub Actions trusted publisher with:
   - owner: `OthmaneBlial`
   - repository: `web-task-agent`
   - workflow filename: `publish-npm.yml`
   - allowed action: `npm publish`
4. Confirm the repository URL is case-exact, run the workflow's manual rehearsal, then create the matching protected tag.
5. After the workflow succeeds, verify the public npm version, provenance, clean `npx` execution, GitHub release, tag, and checksums independently.
6. For `web-task-agent`, also verify that `io.github.othmaneblial/decision-receipt` resolves in the official MCP registry to the same package version and that a clean MCP host launches `web-task-agent mcp serve` without a secret.

The current local session is not authenticated to npm. CI configuration is therefore not public-registry proof, and `ROADMAP.md` must keep that external gate open until the registry and clean-install checks are observed live.
