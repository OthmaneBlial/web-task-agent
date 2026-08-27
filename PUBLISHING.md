# Public npm publishing

The repository can build and prove both public packages without credentials. The first registry publication remains an owner gate: each package **must already exist on the npm registry** before its trusted publisher can be configured. This bootstrap cannot be performed by the tokenless OIDC workflow.

## Packages and tags

| Package | Source | Release tag |
| --- | --- | --- |
| `web-task-agent` | repository root | `v<package-version>` |
| `@othmaneblial/decision-receipt` | `packages/decision-receipt` | `decision-receipt-v<package-version>` |

Both tags invoke `.github/workflows/publish-npm.yml`. The workflow runs on GitHub-hosted Node 24, upgrades to npm 11.5.1 or newer, requests only `contents: read` and `id-token: write`, tests the exact packed tarball in a clean directory, and calls `npm publish` without a token. npm trusted publishing generates provenance automatically.

For the root `web-task-agent` package, that same protected-tag job also waits until the exact version is visible on the public npm registry, then publishes [`server.json`](server.json) to the official MCP registry. The `mcp-publisher` executable is pinned to `v1.8.1`, downloaded only on the ephemeral GitHub runner, checked against its committed SHA-256, and authenticated with GitHub OIDC. Manual workflow rehearsals publish neither npm nor MCP metadata.

Run the credential-free contract check at any time:

```bash
npm run publish:preflight
npm run publish:preflight -- --live
```

The first command validates package metadata, tags, workflow identity, GitHub-hosted runner, Node/npm minimums, OIDC permission, absence of long-lived npm credentials, exact version coupling, and npm-before-MCP ordering. `--live` adds read-only public-registry probes; it neither authenticates nor publishes. After a real release, `npm run publish:preflight -- --require-public` fails unless both exact manifest versions are observable publicly.

## One-time owner gate

Do not add `NPM_TOKEN` or another long-lived publish secret.

1. Sign in to npm as the owner of the `othmaneblial` scope.
2. Run `npm run release:check` and review the exact bootstrap versions. Manually publish one public bootstrap version of each package from its manifest directory. This is mandatory because npm cannot attach trust to a package that does not exist yet.
3. Verify both package pages and confirm that the intended owner controls the unscoped package and the `@othmaneblial` scope.
4. In each package's npm settings, add a GitHub Actions trusted publisher with:
   - owner: `OthmaneBlial`
   - repository: `web-task-agent`
   - workflow filename: `publish-npm.yml`
   - environment: leave blank while the workflow has no `environment:` key
   - allowed action: `npm publish`
5. **Bump each package to a never-published version** after its bootstrap. npm versions are immutable, so tagging the bootstrap version would make the OIDC job attempt an impossible republish.
6. Confirm the repository URL and workflow filename are case-exact, run the workflow's manual rehearsal, then create the matching protected tag for the bumped version.
7. After the workflow succeeds, run the public preflight gate and verify provenance, clean `npx` execution, GitHub release, tag, and checksums independently.
8. For `web-task-agent`, also verify that `io.github.othmaneblial/decision-receipt` resolves in the official MCP registry to the same package version and that a clean MCP host launches `web-task-agent mcp serve` without a secret.

The current local session is not authenticated to npm. CI configuration is therefore not public-registry proof, and `ROADMAP.md` must keep that external gate open until the registry and clean-install checks are observed live.

The bootstrap and immutable-version constraints come from npm's official [`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust/) and [`npm publish`](https://docs.npmjs.com/cli/v11/commands/npm-publish/) documentation. Trusted Publishing requirements and automatic provenance are documented in [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/).
