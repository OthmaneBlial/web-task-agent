# Consumer Productivity: Retention and Churn

**Category:** Retention and Churn

Research why users stay, leave, or downgrade, then turn findings into retention experiments. Focused on personal organization, planning, notes, habits, and everyday digital tools.

## When to use it

churn language, missing value, switching triggers, habit loops, and win-back opportunities

## Run it

```bash
web-task-agent workflow run consumer-productivity-retention-churn \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- churn-risk themes
- retention drivers
- experiment backlog
- metric and cohort questions

## Source strategy

- cancellation and downgrade reviews
- support and feature-request discussions
- switching and retention case studies

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Retention and Churn"
```
