# Education: Feature Gap Discovery

**Category:** Feature Gap Discovery

Find the smallest high-signal product gap instead of collecting an unranked feature wish list. Focused on learning experiences, study workflows, instructors, and education operations.

## When to use it

missing capabilities, workaround behaviour, requested outcomes, and evidence of urgency

## Run it

```bash
web-task-agent workflow run education-feature-gap \
  --topic "a focused product or market question" \
  --preset standard
```

Use `--preset deep` when the decision is high-stakes or you need broader source coverage. Add `--audience` and `--context` to constrain the research to a specific buyer, geography, product stage, or business question.

## Decision-ready output

- ranked feature gaps
- workarounds people use
- MVP scope proposal
- disconfirming evidence

## Source strategy

- public issue trackers
- feature-request threads
- review and workaround discussions

The run also saves the report, source evidence, contradictions, prompt trace, and a resumable state under `reports/workflows/` and `.data/`.

## Explore related workflows

```bash
web-task-agent workflow list --category "Feature Gap Discovery"
```
