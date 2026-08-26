# Local-First Risk Review

This is a deterministic, bundled demo package. It proves the package shape and source-trace reading flow without using an API key, browser session, or live network request. It is not a claim that a fresh live run produced these findings.

Scenario: Review a local research run for unsafe targets, secret exposure, source manipulation, and unsafe sharing before treating its output as ready.

Start with [receipt.html](receipt.html) for the visual decision handoff, then inspect [receipt.json](receipt.json), run `web-task-agent receipt verify .`, and read [handoff/workflow-brief.md](handoff/workflow-brief.md), [report.md](report.md), and [evidence/sources.json](evidence/sources.json).
