# Public npm publishing

The repository can build and prove both public packages without credentials. The first registry publication remains an owner gate because npm must know which account owns each name before its trusted publisher can be configured.

## Packages and tags

| Package | Source | Release tag |
| --- | --- | --- |
| `web-task-agent` | repository root | `v<package-version>` |
| `@othmaneblial/decision-receipt` | `packages/decision-receipt` | `decision-receipt-v<package-version>` |

Both tags invoke `.github/workflows/publish-npm.yml`. The workflow runs on GitHub-hosted Node 24, upgrades to npm 11.5.1 or newer, requests only `contents: read` and `id-token: write`, tests the exact packed tarball in a clean directory, and calls `npm publish` without a token. npm trusted publishing generates provenance automatically.

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
5. After the workflow succeeds, verify the public registry version, provenance, clean `npx` execution, GitHub release, tag, and checksums independently.

The current local session is not authenticated to npm. CI configuration is therefore not public-registry proof, and `ROADMAP.md` must keep that external gate open until the registry and clean-install checks are observed live.
