# Release Checklist

Use this checklist to prove a candidate is ready to release. A passing local command is not a publication: publishing to npm, creating a GitHub release, changing repository visibility, or enabling Pages still requires an explicit maintainer decision.

## 1. Verify the candidate from a clean worktree

```bash
npm ci
npm run release:check
git status --short
```

Expected result: tests, generated-content checks, Markdown-link checks, production dependency audit, and `npm pack --dry-run` all pass. `git status --short` must be empty afterwards.

## 2. Review what would become public

- Read `README.md`, `PRIVACY.md`, `SECURITY.md`, `SUPPORT.md`, `LICENSE`, and `CHANGELOG.md` as a first-time user.
- Inspect the three deterministic receipts in `examples/receipts/`; they are fixtures, not current research claims.
- Confirm the npm tarball file list from `npm pack --dry-run` only includes the intended CLI, runtime modules, installer, and public policies.
- Search tracked source for accidental credentials or private artifacts before releasing. Do not add real keys to test fixtures or documentation.
- Confirm that a live research run uses a narrow, operator-owned key and that no report, cache, database, cookie, or prompt trace is staged.

## 3. Decide the public surface explicitly

- Decide whether `OthmaneBlial/web-task-agent` may become public. A private repository cannot receive public stars, forks, external issues, or pull requests.
- If public, set the GitHub description, Topics, homepage, social preview, issue labels, and Discussions deliberately.
- Verify the public repository, README rendering, license display, and CI status in a logged-out browser.
- Publish a GitHub release only after choosing its version and release notes. Publish to npm only after confirming registry ownership and the exact tarball.
- Deploy the static documentation site only after choosing its canonical public URL and confirming privacy wording still matches the runtime.

## 4. Verify after publication

- Open the public repository, release/tag, package registry page, and site from a clean browser context.
- Install the released package in a temporary directory and run `web-task-agent demo export browser-agent-landscape`.
- Check that the generated package opens, cites its source metadata, and clearly identifies its fixture status.
- Announce one evidence-backed demo to a relevant community; do not claim virality, freshness, benchmark superiority, or hosted operation that has not been demonstrated.
