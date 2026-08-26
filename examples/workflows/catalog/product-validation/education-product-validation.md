# Education: Product Validation

**Category:** Product Validation

Build a falsifiable validation plan around a concrete product hypothesis. Focused on learning experiences, study workflows, instructors, and education operations.

## When to use it

evidence for and against demand, urgency, reachable users, current alternatives, and test design

## Run it

```bash
web-task-agent workflow run education-product-validation \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- hypothesis scorecard
- supporting and contradictory evidence
- test sequence
- stop or proceed criteria

## Source strategy

- problem-owner discussions
- current-alternative reviews
- public evidence that can falsify demand

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Product Validation"
```
