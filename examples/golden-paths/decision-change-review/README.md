# Decision Change Review

## When to use it

Use this path when a new public signal might change a product or market decision. It keeps a baseline, a later run, source additions/removals, changed claims, contradictions, and the next validation together. Use it instead of asking a chatbot for a fresh opinion when the reason for the change matters.

## Run it

```bash
web-task-agent workflow run decision-change-review \
  --topic "local browser research baseline" \
  --preset focused

web-task-agent workflow run decision-change-review \
  --topic "local browser research current" \
  --preset focused

web-task-agent receipt compare \
  reports/workflows/decision-change-review/local-browser-research-baseline \
  reports/workflows/decision-change-review/local-browser-research-current
```

The live workflow needs the configured Anthropic-compatible endpoint. The bundled receipt below is a deterministic fixture and does not claim fresh research.

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

Open the [rendered fixture receipt](receipt.html), then compare two live packages with `receipt verify` and `receipt compare`.

## What could invalidate the decision

The apparent change may come from a stale source, a changed query/policy, a model interpretation, or a source that is not representative. Re-open the changed excerpts and run the smallest test that could disprove the new direction.
