# Competitor Map

## When to use it

Use this path to choose where not to compete. It keeps first-party positioning, pricing signals, user evidence, meaningful gaps, and uncertainty in one package instead of flattening a market into a feature checklist.

## Run it

```bash
web-task-agent workflow run ai-developer-tools-competitor-map \
  --topic "local evidence-backed research receipts" \
  --preset focused
```

This is useful when a browser agent can collect pages but the team still needs a defensible choice and a handoff that another person can inspect.

## Expected package

```text
<run-directory>/
├── receipt.json
├── integrity-manifest.json
├── report.md
├── handoff/
│   ├── README.md
│   ├── workflow-brief.md
│   └── package-manifest.json
└── raw/research/
```

Open the [rendered fixture receipt](receipt.html) before configuring a live browser or model.

## What could invalidate the decision

Competitor pages can be stale or promotional, and an apparent gap may be a low-value request. Verify the strongest claims against primary sources and test the proposed differentiation with target operators.
