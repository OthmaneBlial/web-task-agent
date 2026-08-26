# HR and Recruiting: Market Entry

**Category:** Market Entry

Choose a narrow entry wedge using public evidence, constraints, and incumbent weakness. Focused on hiring, employee operations, learning, performance, and people systems.

## When to use it

entry segments, local or vertical constraints, incumbent alternatives, distribution paths, and regulatory caveats

## Run it

```bash
web-task-agent workflow run hr-recruiting-market-entry \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- entry-wedge options
- incumbent map
- channel hypotheses
- risk and research checklist

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Market Entry"
```
