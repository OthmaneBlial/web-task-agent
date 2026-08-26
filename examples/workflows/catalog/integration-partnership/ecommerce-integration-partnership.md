# E-commerce: Integration and Partnership

**Category:** Integration and Partnership

Prioritize integrations and ecosystem partners according to user pull and mutual value. Focused on merchant operations, conversion, retention, fulfilment, and customer support.

## When to use it

stack adjacency, existing integrations, workflow hand-offs, community requests, and partner fit

## Run it

```bash
web-task-agent workflow run ecommerce-integration-partnership \
  --topic "returns automation for Shopify stores" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- integration shortlist
- user-pull evidence
- partnership thesis
- technical and commercial risks

## Source strategy

- integration directories and documentation
- public API and ecosystem pages
- community connector requests

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Integration and Partnership"
```
