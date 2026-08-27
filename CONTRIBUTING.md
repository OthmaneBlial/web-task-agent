# Contributing

This project is a local-first research system. When you change behavior, keep the code path, the docs, and the tests aligned.

## Start Here

- `src/cli.ts` is the command entry point.
- `src/tasks/agent-runner.ts` orchestrates the long-running research stages.
- `src/lib/job-store.ts` owns durable job, evidence, and artifact state.
- `src/lib/job-queue.ts` owns queued execution.
- `src/server/management-server.ts` serves the dashboard and API.
- `src/workflows/index.ts` defines the built-in workflow templates.

## Main Execution Path

1. A CLI command enters through `src/cli.ts`.
2. The command validates input and builds job options.
3. The job store and queue persist the durable state.
4. The agent runner executes plan, search, fetch, extract, and synthesize stages.
5. Reports, workflow packages, and prompt traces land on disk.
6. The management server exposes the stored state back to the operator.

## Useful Commands

```bash
npm run build
npm test
npm run start -- workflow list
npm run start -- job inspect <job-id>
npm run start -- job report <job-id>
npm run start -- job budget <job-id>
npm run start -- storage maintain
npm run start -- storage cleanup --prompt-traces <path>
```

## When You Change Behavior

- Update the nearest doc page in `docs/content/`.
- Add or extend tests for the changed path.
- Keep command output labels stable when possible.
- Prefer small, focused commits when the change maps cleanly to one behavior.

## Add A Workflow Proposal

You do not need to understand the full runner to propose a workflow. Start with the scaffold:

```bash
npm run start -- workflow scaffold developer-tool-review \
  --title "Developer Tool Review" \
  --category "Validation"
```

It creates a proposal definition, run example, fixture, and test plan under `workflows/proposals/`. Replace the placeholders, then validate the schema before opening a review:

```bash
npm run start -- workflow validate workflows/proposals/developer-tool-review/workflow.json
```

Validation checks the required id, decision, source-policy, query, deliverable, freshness, bounded cost, and risk fields. It does not register or run anything, and it intentionally cannot decide whether your workflow is semantically distinct. A proposal becomes executable only after a reviewer verifies all of the following:

- the operator decision is repeated and specific;
- queries and deliverables are materially distinct from the closest catalog workflow;
- preferred and excluded sources, freshness, cost, privacy, and safety risks are explicit;
- the included deterministic fixture proves the output keeps sources, contradictions, and the smallest next validation;
- catalog documentation and generated examples pass `npm test` without drift.

Use the workflow proposal issue form for the discussion. Maintainers should apply `workflow-review`, `needs-evidence`, `good first workflow`, or `help wanted` when the repository labels are available.

## Good First Checks

- run `npm run build`
- run the relevant `node --test dist/tests/<file>.test.js` files
- inspect the README and CLI reference for stale examples
- update the stored roadmap entry if the change is part of an active phase

## Contribution Loop

The smallest useful contribution is a reproducible decision artifact:

1. Start from one of the [golden paths](examples/golden-paths/) or propose a distinct workflow with the issue form.
2. Attach a redacted receipt, source policy, limitation, and smallest next validation.
3. Add or update the deterministic fixture and its test before changing the catalog.
4. Run `npm test`, `npm run first-success`, and `npm run evaluate:receipts`.
5. Open a focused pull request. Reviewers should be able to verify the claim links and reproduce the output without your credentials.

Do not optimize for star count, benchmark theater, or a large prompt catalog. A contribution is ready when another operator can inspect it, disagree with it, and run the next validation.

### Starter issues

- [Map one redistributable agent output through a strict adapter](https://github.com/OthmaneBlial/web-task-agent/issues/11)
- [Add one adversarial policy regression fixture](https://github.com/OthmaneBlial/web-task-agent/issues/3)
- [Reproduce a golden-path receipt on a clean machine](https://github.com/OthmaneBlial/web-task-agent/issues/2)
- [Propose one bounded decision with a receipt fixture](https://github.com/OthmaneBlial/web-task-agent/issues/4)
- [Independently review one Decision Receipt security boundary](https://github.com/OthmaneBlial/web-task-agent/issues/10)
- [Run one consented external reviewer study](https://github.com/OthmaneBlial/web-task-agent/issues/12) in the [local-only Evidence Lab](https://othmaneblial.github.io/web-task-agent/study.html) or with the fixed [`AB`/`BA` study kit](studies/reviewer-value/)

The dedicated issue forms also define complete acceptance contracts for a provider-neutral adapter, adversarial policy case, reproducible receipt review, schema RFC, and opt-in gallery entry. A form is an invitation, not evidence that an external contribution exists.

## Specification and public-artifact governance

- Read [MAINTAINERS.md](MAINTAINERS.md) for authority, compatibility, and release rules.
- Any breaking schema, canonicalization, signing, archive, path, or status-semantic change follows the mandatory [Decision Receipt RFC process](docs/rfcs/README.md) before implementation.
- Use [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for the independent-review scope and private advisory boundary.
- External case studies follow [EXTERNAL_VALIDATION.md](EXTERNAL_VALIDATION.md), including granular consent and honest zero baselines.
- Reviewer-value responses use the local [`studies/reviewer-value/`](studies/reviewer-value/) validator and aggregator; fixtures and non-consented measures never count as external adoption.
- Public receipts enter the [opt-in gallery](gallery/README.md) only after license, redaction, consent, secret, and offline-integrity review. Nothing is collected automatically.

Discussion starters:

- [First-run help](https://github.com/OthmaneBlial/web-task-agent/discussions/5)
- [Receipt review](https://github.com/OthmaneBlial/web-task-agent/discussions/6)
- [Workflow ideas](https://github.com/OthmaneBlial/web-task-agent/discussions/7)
- [Show your decision package](https://github.com/OthmaneBlial/web-task-agent/discussions/8)

## Project Shape

- `reports/` is for human-facing output.
- `.cache/` is for resumable state.
- `.data/` is for durable database state.
- `base/` stays local-only and ignored by git.

## If You Are Unsure

Read the docs in this order:

1. `README.md`
2. `docs/content/overview.md`
3. `docs/content/getting-started.md`
4. `docs/content/cli-reference.md`
5. `docs/content/project-layout.md`
