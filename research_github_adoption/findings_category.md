# Findings — category and ownable position

Snapshot: 2026-08-27. Star counts are volatile and are included only to show category scale, not as product-quality proof.

## Current category expectations

- [Browser Use](https://github.com/browser-use/browser-use) presents a direct promise — an AI agent uses a browser — followed by a short install, example tasks, benchmark evidence, model choice, integrations, and hosted scaling. GitHub API reported about 111k stars.
- [Stagehand](https://github.com/browserbase/stagehand) presents itself as the SDK for browser agents and emphasizes familiar APIs, self-healing, token efficiency, reliability, observability, and TypeScript/Python/Go distribution. GitHub API reported about 24k stars.
- [GPT Researcher](https://github.com/assafelovic/gpt-researcher) owns comprehensive report generation across web and local data, multiple providers, UI, package usage, and MCP integration. GitHub API reported about 29k stars.
- [smolagents](https://github.com/huggingface/smolagents) owns a small agent-building library rather than an end-user research workflow. GitHub API reported about 29k stars.

These projects make browser control, report generation, model choice, benchmarks, packages, integrations, and agent-facing installation normal category expectations. Competing with them on “more workflows,” “a browser agent,” or “deep research with citations” would hide Web Task Agent inside their category.

## Position that remains open enough to own

Web Task Agent has a credible wedge after the research run:

> Turn any agent's research result into a local Decision Receipt that a human or CI job can verify, diff, challenge, and archive offline.

This changes the comparison set. Browser Use or Stagehand can perform acquisition; GPT Researcher can produce a report; Web Task Agent can become the audit and handoff layer that accepts their results without importing sessions or trusting provider runtime.

## Implications

- Lead with the receipt protocol and reviewer outcome, not the bundled agent engine.
- Make the verifier usable without installing the full research runner.
- Put verification where developers already work: pull requests, CI, MCP clients, and a local-only web verifier.
- Demonstrate authentic imports from existing engines instead of claiming to replace them.
- Measure whether an external reviewer can find support, contradiction, freshness, and tampering faster; do not claim higher research accuracy without evidence.
