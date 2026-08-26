# Launch kit — Web Task Agent v0.2.0

This is a factual, reusable launch kit for maintainers. Adapt the audience and keep the links intact; do not claim adoption, benchmark results, or fresh research that has not been independently verified.

## The short version

Web Task Agent turns a messy web question into a local, evidence-backed decision package. A run leaves behind the brief, source trail, contradictions, report, and next validation so that a teammate can inspect and resume it after the browser closes.

Try a deterministic demo without an API key or browser:

```bash
curl -fsSL https://raw.githubusercontent.com/OthmaneBlial/web-task-agent/main/install.sh \
  | bash -s -- --skip-llm-setup
web-task-agent demo export browser-agent-landscape
```

## Links to share

- Project site: https://othmaneblial.github.io/web-task-agent/
- README and installation: https://github.com/OthmaneBlial/web-task-agent#readme
- First release: https://github.com/OthmaneBlial/web-task-agent/releases/tag/v0.2.0
- Workflow catalog: https://github.com/OthmaneBlial/web-task-agent/blob/main/examples/workflows/CATALOG.md
- Contributing: https://github.com/OthmaneBlial/web-task-agent/blob/main/CONTRIBUTING.md

## Show HN draft

**Title:** Show HN: Web Task Agent – local, evidence-backed research packages

**Body:**

I built Web Task Agent for research that has to survive scrutiny after the browser closes. Instead of returning only an answer, it stores a local package with a brief, source snapshots, evidence clusters, contradictions, report, and the next validation.

It includes 243 executable workflows, three deterministic demos that work without an API key or browser, queue recovery, redacted exports, and review-gated decision packs. The project is local-first: it has no required hosted control plane and no non-essential telemetry by default.

Project site: https://othmaneblial.github.io/web-task-agent/

I would especially value feedback on the quality of the decision package, the first-run experience, and which research decisions should become the next reviewed workflow packs.

## Audience-specific angles

| Audience | Lead with | Ask for |
| --- | --- | --- |
| Devtools developers | Durable jobs, local CLI, deterministic demos, source policy | Feedback on installation and recovery |
| Product and research teams | Brief, source trail, contradictions, reusable workflows | A decision type worth turning into a pack |
| Privacy-conscious teams | Local storage, explicit model boundary, redaction, no required hosted control plane | Review of the local-data contract |
| Prospective contributors | Scaffold, validation, labels, documented output contract | One focused workflow proposal with source and risk rationale |

## Before publishing a post

- Re-run `npm run release:check` from a clean `main` checkout.
- Open the project site and the release link from an incognito browser.
- Link to the deterministic demo before describing a live-model workflow.
- State limits plainly: browser/model credentials and real-source runs are operator-controlled and are not exercised by the deterministic demos.
- Treat replies as product evidence. Create an issue or Discussion only when the feedback is actionable.
