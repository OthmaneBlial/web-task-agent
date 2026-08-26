# Mobile Apps: Product Validation

**Category:** Product Validation

Build a falsifiable validation plan around a concrete product hypothesis. Focused on mobile-first products, app discovery, retention, subscriptions, and store feedback.

## When to use it

evidence for and against demand, urgency, reachable users, current alternatives, and test design

## Run it

```bash
web-task-agent workflow run mobile-apps-product-validation \
  --topic "subscription retention for meditation apps" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- hypothesis scorecard
- supporting and contradictory evidence
- test sequence
- stop or proceed criteria

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Product Validation"
```
