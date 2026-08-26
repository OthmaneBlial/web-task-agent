# Internal Tools: Buyer Journey

**Category:** Buyer Journey

Reveal the moments that create momentum or abandonment between discovery and adoption. Focused on operations consoles, approvals, back-office workflows, and knowledge systems.

## When to use it

discovery paths, evaluation criteria, objections, onboarding friction, and trust signals

## Run it

```bash
web-task-agent workflow run internal-tools-buyer-journey \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- journey map
- adoption blockers
- trust requirements
- activation experiments

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Buyer Journey"
```
