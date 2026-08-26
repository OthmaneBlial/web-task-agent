# Cloud and DevOps: Launch Positioning

**Category:** Launch Positioning

Convert researched evidence into a focused launch narrative and proof plan. Focused on deployment, CI/CD, infrastructure, reliability, and cloud operations.

## When to use it

sharp category language, credible promise, proof required, objections, and launch audiences

## Run it

```bash
web-task-agent workflow run cloud-devops-launch-positioning \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- positioning statement
- message hierarchy
- proof asset brief
- launch channel hypotheses

## Source strategy

- competitor launch pages
- customer-language discussions
- credible proof assets and case studies

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Launch Positioning"
```
