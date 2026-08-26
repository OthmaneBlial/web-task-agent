# Marketplaces: Content Demand

**Category:** Content Demand

Find content topics with evidence of a real unanswered question, not merely high-volume keywords. Focused on supply-demand platforms, trust, matching, liquidity, and provider operations.

## When to use it

repeated questions, misconceptions, practical examples, credible sources, and content gaps

## Run it

```bash
web-task-agent workflow run marketplaces-content-demand \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- content opportunity map
- evidence-backed angles
- claim checklist
- distribution communities

## Source strategy

- official documentation
- repeated technical questions
- maintainer issues and practitioner discussions

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Content Demand"
```
