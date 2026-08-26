# Data and Analytics: Audience Segmentation

**Category:** Audience Segmentation

Separate lookalike audiences by job, trigger, and desired outcome. Focused on BI, data operations, governance, experimentation, and analytics workflows.

## When to use it

distinct user groups, trigger events, jobs-to-be-done, language, and urgency

## Run it

```bash
web-task-agent workflow run data-analytics-audience-segmentation \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- segment cards
- trigger-to-outcome map
- priority segment recommendation
- messages to validate

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Audience Segmentation"
```
