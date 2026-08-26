# Research receipts

These three receipts are deterministic fixtures: they make the product’s output contract inspectable without an API key, browser, or live network request. They are not evidence that a new live research job produced current findings.

| Receipt | Question it demonstrates | Start here |
| --- | --- | --- |
| Browser Agent Landscape | How should the project differentiate from browser-control, crawling, and agent frameworks? | [Brief](examples/receipts/browser-agent-landscape/handoff/workflow-brief.md) · [Report](examples/receipts/browser-agent-landscape/report.md) · [Sources](examples/receipts/browser-agent-landscape/evidence/sources.json) |
| Workflow Quality Audit | Does a proposed workflow deserve to enter the catalog? | [Brief](examples/receipts/workflow-quality-audit/handoff/workflow-brief.md) · [Report](examples/receipts/workflow-quality-audit/report.md) · [Sources](examples/receipts/workflow-quality-audit/evidence/sources.json) |
| Local-First Risk Review | What must be checked before a local research result is treated as safe to share? | [Brief](examples/receipts/local-first-risk-review/handoff/workflow-brief.md) · [Report](examples/receipts/local-first-risk-review/report.md) · [Sources](examples/receipts/local-first-risk-review/evidence/sources.json) |

Regenerate them after changing the fixture definitions:

```bash
npm run generate:receipts
```

For live work, run a workflow and use `job export --redact --dry-run` before sharing. A live receipt must retain the collection date, source URLs, uncertainty, and the smallest next validation.
