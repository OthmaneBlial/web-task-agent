# Deterministic fixture snapshot — Web Task Agent workflow contribution guidance

- URL: https://github.com/OthmaneBlial/web-task-agent/blob/main/CONTRIBUTING.md
- Publisher: Web Task Agent
- Captured: 2026-08-26
- Capture type: fixture-synthetic

This snapshot is bundled evidence for the deterministic demo. It is not a live copy of the linked page.

# Workflow Quality Audit

## Decision

Accept a workflow only when it addresses a repeated operator decision and produces a stable evidence-backed handoff.

## Evaluation rubric

1. **Decision:** the operator can name the decision this workflow improves.
2. **Evidence:** sources are suitable, accessible, and not all marketing material.
3. **Distinctness:** queries and deliverables are not a renamed copy of an existing workflow.
4. **Handoff:** the output names the recommendation, source trail, uncertainty, contradictions, and smallest next test.
5. **Safety:** the workflow declares source restrictions, data risks, and human review points.

## Rejection examples

- A prompt that only changes the target industry but preserves the same decision and query strategy.
- A workflow that turns unverified search snippets into a recommendation.
- A workflow whose output cannot be inspected after an interrupted run.

## Next validation

Use this rubric against a contributor proposal and record the reviewer decision in the pull request.
