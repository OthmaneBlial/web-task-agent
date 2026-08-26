# Changelog

This file is intentionally lightweight.

## 0.4.0 — 2026-08-26

- Added a visual, standalone `receipt.html` to every deterministic demo: decision, supporting evidence, invalidation conditions, source cards, and the smallest next validation in one portable handoff.
- Published the featured receipt in the static site and reshaped the README around proof before setup instead of a large hero image.
- Added an explicit strict `typecheck` command, shared editor settings, and CI coverage for the static quality gate.

## 0.3.4 — 2026-08-26

- Denied source hostnames that resolve to private, reserved, documentation, or otherwise unsafe addresses before robots lookup or browser navigation.
- Kept the local management dashboard on loopback hosts only, bounded JSON control payloads, and returned actionable client errors for malformed requests.
- Added an installable, documented `.env.example` and reduced CI token permissions to read-only repository contents.

## 0.3.3 — 2026-08-26

- Published the scoped GitHub Packages mirror `@othmaneblial/web-task-agent` from a repository-owned manual workflow using the ephemeral GitHub Actions token.
- Documented the GitHub Packages authentication requirement so the install command is explicit about the required `read:packages` token scope.

## 0.3.2 — 2026-08-26

- Included the decision-pack runtime in the published npm tarball, fixing a missing `dist/packs` module at CLI startup.
- Added a tarball-content check for the CLI, demos, packs, server, tasks, and workflows required by the public command.
- Reworked the README opening around the inspectable decision package rather than a large product screenshot.

## 0.3.1 — 2026-08-26

- Fixed the published `web-task-agent` executable by preserving its Node shebang through TypeScript compilation.
- Added a package-bin test that prevents future release tarballs from installing a non-executable CLI.

## 0.3.0 — 2026-08-26

- Added five deterministic, source-linked receipts for launch readiness, competitor mapping, GitHub feedback, technical article claims, and app-review opportunities.
- Expanded the public demo gallery to eight receipts, each with a decision, limits, next validation, and three accessible sources.
- Added a repository Discussion for workflow ideas, reviewable receipts, and first-run questions.

## 0.2.0 — 2026-08-26

- Added 240 executable catalog workflows, filters, generated examples, and catalog tests.
- Added deterministic, source-linked demo packages that work without an API key or browser session.
- Added public-release foundation: MIT license, security policy, support policy, code of conduct, issue forms, Dependabot, and npm package metadata.
- Added a no-key installer path for demos and local commands.
- Added job recovery reports with a recommended next command, performance budget checks, and prompt-trace cleanup retention.
- Added five review-gated decision packs plus dry-run previews that show per-step and aggregate work bounds before writing or launching anything.
- Added local Markdown, JSON, and CSV job exports, redaction previews, and source/conclusion comparisons between runs.
- Added responsible source acquisition controls: public-target policy, `robots.txt` signals, per-domain pacing, redirect quarantine, and page-instruction detection.
- Added a local-data contract, safe SQLite backup/restore, and a reproducible release preflight checklist.
- Added proposal validation for decision, source, query, deliverable, risk, freshness, and work-cost contracts before review.
- Added a public documentation site and repository launch assets.

## Process

- Add one short bullet for any user-visible behavior change.
- Keep entries short enough that they are easy to maintain during normal work.
- Group closely related changes under the same unreleased section until the next release point is obvious.
