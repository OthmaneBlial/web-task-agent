# Consumer Productivity: Voice of Customer

**Category:** Voice of Customer

Turn recurring public complaints and requests into a traceable customer-problem brief. Focused on personal organization, planning, notes, habits, and everyday digital tools.

## When to use it

repeated pain, language customers use, severity, and situations where existing tools fail

## Run it

```bash
web-task-agent workflow run consumer-productivity-voice-of-customer \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- ranked pain clusters
- verbatim evidence links
- customer-language summary
- validation interviews to run

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Voice of Customer"
```
