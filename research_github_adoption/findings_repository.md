# Findings — repository and public baseline

Snapshot: 2026-08-27.

## Shipped product evidence

- `v0.5.1` is the current tagged release. Its public release contains a tarball and `SHA256SUMS`; the tag workflow and the current `main` CI both pass.
- A clean local `npm ci && npm test` passed with 139 unit tests and 4 integration tests. Generated workflow examples, eight receipts, three golden paths, the interoperability fixture, scorecard, documentation mirror, and 368 local Markdown links all passed their checks.
- The repository already implements the former roadmap's core: Receipt v1 structures, offline verification, comparison, provider-neutral import, optional Ed25519 signing, integrity manifests, deterministic fixtures, trust documentation, contributor templates, a Pages site, and a release pipeline.
- The live Pages site and featured receipt are visually polished and have no console errors in the inspected desktop state.

## Public adoption evidence

GitHub API snapshot for <https://github.com/OthmaneBlial/web-task-agent>:

- 0 stars, 0 forks, 0 watchers.
- Three open issues, all authored by the maintainer on 2026-08-26.
- Five Discussions, all authored by the maintainer; none has a chosen answer.
- The `v0.5.1` tarball and checksum each report one download, consistent with release verification rather than demonstrated external adoption.

This means the productization work is real, but external activation, repeated use, independent review, and contribution are not yet evidenced.

## Remaining product gaps

- The existing `ROADMAP.md` still describes Receipt v1, golden paths, the scorecard, interop, signing, release assets, and community seeding as future work although those items shipped in `v0.5.1`.
- `LAUNCH.md` still identifies `v0.4.0` and links directly to that historical release.
- The public homepage's hero is attractive, but its “Quick Start” starts with `npm ci` and `npm run start`; that is a contributor-from-source path, not the clean public install path documented in the README.
- The featured receipt demonstrates the visual handoff well, but visitors cannot upload, verify, or compare their own receipt in the browser. The strongest product action is therefore still passive.
- No package is present on the public npm registry. The documented GitHub Packages mirror requires registry authentication; the canonical unauthenticated path is a GitHub release tarball.
- `package.json` points `main` at `dist/cli.js`, exposes no `exports` map and no `types` entry, and bundles the full CLI/provider dependency surface. Receipt validation is not yet a small reusable SDK.
- The receipt version is a TypeScript contract inside `src/lib/receipt.ts`; there is no independently consumable JSON Schema, compatibility matrix, migration policy, or external conformance kit.
- The single checked-in interoperability input represents a Browser Use-shaped generic export. There is no evidence yet from authentic external engine runs.
- The repository does not ship a reusable GitHub Action, MCP server, agent skill, or other surface that places receipt verification inside workflows users already run.

## Core conclusion

The next bottleneck is not more workflows or more agent autonomy. It is turning the Decision Receipt from a strong feature inside one CLI into a tiny, interoperable, visible protocol and review tool that other repositories and agents can adopt.
