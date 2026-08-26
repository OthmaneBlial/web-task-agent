# E-commerce: Competitor Map

**Category:** Competitor Map

Map direct and adjacent alternatives so a team can choose where not to compete. Focused on merchant operations, conversion, retention, fulfilment, and customer support.

## When to use it

competitor positioning, target audiences, pricing signals, weak spots, and meaningful differentiation

## Run it

```bash
web-task-agent workflow run ecommerce-competitor-map \
  --topic "returns automation for Shopify stores" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- competitor landscape
- positioning gaps
- feature and pricing comparison
- avoidance and differentiation advice

## Source strategy

- first-party product and pricing pages
- release notes and documentation
- independent comparison and review sources

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Competitor Map"
```
