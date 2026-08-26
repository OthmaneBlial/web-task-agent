# Research receipts

These eight receipts are deterministic fixtures: they make the product’s output contract inspectable without an API key, browser, or live network request. They are not evidence that a new live research job produced current findings.

| Receipt | Question it demonstrates | Start here |
| --- | --- | --- |
| Browser Agent Landscape | How should the project differentiate from browser-control, crawling, and agent frameworks? | [Brief](examples/receipts/browser-agent-landscape/handoff/workflow-brief.md) · [Report](examples/receipts/browser-agent-landscape/report.md) · [Sources](examples/receipts/browser-agent-landscape/evidence/sources.json) |
| Workflow Quality Audit | Does a proposed workflow deserve to enter the catalog? | [Brief](examples/receipts/workflow-quality-audit/handoff/workflow-brief.md) · [Report](examples/receipts/workflow-quality-audit/report.md) · [Sources](examples/receipts/workflow-quality-audit/evidence/sources.json) |
| Local-First Risk Review | What must be checked before a local research result is treated as safe to share? | [Brief](examples/receipts/local-first-risk-review/handoff/workflow-brief.md) · [Report](examples/receipts/local-first-risk-review/report.md) · [Sources](examples/receipts/local-first-risk-review/evidence/sources.json) |
| Product Launch Readiness | Is a public launch supported by reproducible proof and clear limits? | [Brief](examples/receipts/product-launch-readiness/handoff/workflow-brief.md) · [Report](examples/receipts/product-launch-readiness/report.md) · [Sources](examples/receipts/product-launch-readiness/evidence/sources.json) |
| Competitor Decision Map | How should a product be positioned alongside adjacent tools without unsupported comparisons? | [Brief](examples/receipts/competitor-decision-map/handoff/workflow-brief.md) · [Report](examples/receipts/competitor-decision-map/report.md) · [Sources](examples/receipts/competitor-decision-map/evidence/sources.json) |
| GitHub Issue Opportunity | Where should public repository feedback go, and what evidence does it need next? | [Brief](examples/receipts/github-issue-opportunity/handoff/workflow-brief.md) · [Report](examples/receipts/github-issue-opportunity/report.md) · [Sources](examples/receipts/github-issue-opportunity/evidence/sources.json) |
| Technical Article Brief | How can a technical article keep implementation claims, caveats, and sources reviewable? | [Brief](examples/receipts/technical-article-brief/handoff/workflow-brief.md) · [Report](examples/receipts/technical-article-brief/report.md) · [Sources](examples/receipts/technical-article-brief/evidence/sources.json) |
| App Review Opportunity | Do recurring public app-review complaints justify a product opportunity test? | [Brief](examples/receipts/app-review-opportunity/handoff/workflow-brief.md) · [Report](examples/receipts/app-review-opportunity/report.md) · [Sources](examples/receipts/app-review-opportunity/evidence/sources.json) |

Regenerate them after changing the fixture definitions:

```bash
npm run generate:receipts
```

For live work, run a workflow and use `job export --redact --dry-run` before sharing. A live receipt must retain the collection date, source URLs, uncertainty, and the smallest next validation.
