# Local Business: Competitor Map

**Category:** Competitor Map

Map direct and adjacent alternatives so a team can choose where not to compete. Focused on service businesses, bookings, repeat customers, and day-to-day operations.

## When to use it

competitor positioning, target audiences, pricing signals, weak spots, and meaningful differentiation

## Run it

```bash
web-task-agent workflow run local-business-competitor-map \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- competitor landscape
- positioning gaps
- feature and pricing comparison
- avoidance and differentiation advice

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Competitor Map"
```
