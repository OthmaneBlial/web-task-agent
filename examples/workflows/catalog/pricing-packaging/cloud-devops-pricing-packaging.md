# Cloud and DevOps: Pricing and Packaging

**Category:** Pricing and Packaging

Research value metrics and buying friction before changing a pricing page or paywall. Focused on deployment, CI/CD, infrastructure, reliability, and cloud operations.

## When to use it

pricing models, willingness-to-pay hints, plan structure, free limits, and objection patterns

## Run it

```bash
web-task-agent workflow run cloud-devops-pricing-packaging \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- pricing model map
- value-metric hypotheses
- plan and limit ideas
- pricing risks to test

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Pricing and Packaging"
```
