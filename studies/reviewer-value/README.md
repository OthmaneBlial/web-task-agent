# Reviewer-value study kit

This kit implements the counterbalanced comparison defined in [`EXTERNAL_VALIDATION.md`](../../EXTERNAL_VALIDATION.md). It measures review mechanics for a Markdown report versus the same facts packaged with a Decision Receipt. It contains no telemetry, live source, model call, browser session, or participant data.

The hosted [Reviewer Evidence Lab](https://othmaneblial.github.io/web-task-agent/study.html) presents this same protocol, timers, local ZIP downloads, and anonymous JSON export in the browser. It has no submission endpoint or persistence. The CLI remains the authoritative validator and aggregator for exported responses.

The two cases are deliberately synthetic and structurally parallel. Each has:

- `report.md` with the decision, three claims, source dates, contradiction, limitations, and next validation;
- `receipt/` with the same semantics, source snapshots, hashes, and a valid manifest;
- `tampered-receipt/` where exactly one evidence file changed after the manifest was created.

The generator verifies both valid receipts and requires each controlled tamper to fail on the exact evidence path. Integrity still does not establish source or decision truth.

## Counterbalanced assignment

Alternate participants between the groups in [`assignments.json`](assignments.json):

| Group | First trial | Second trial |
| --- | --- | --- |
| `AB` | case A, Markdown only | case B, receipt |
| `BA` | case A, receipt | case B, Markdown only |

Do not show [`answer-key.json`](answer-key.json) until the response is complete. A facilitator starts the timer immediately before revealing a trial and stops it after the four answers and confidence score are recorded. Interruptions belong in `friction`; an unfinished trial is marked `abandoned` instead of being silently removed.

## Four tasks per trial

1. Return the evidence ID supporting the bounded positive claim.
2. Return the contradicted claim ID.
3. Return the stale source ID.
4. Determine whether exported evidence changed. In the receipt condition, verify `tampered-receipt/` and return the exact changed file. In Markdown-only, use only `report.md`; answer `not-determinable` when unchanged bytes cannot be established.

For receipt trials, verify the valid bundle before inspecting it:

```bash
npm run build
node dist/cli.js receipt verify studies/reviewer-value/materials/case-a/receipt
node dist/cli.js receipt verify studies/reviewer-value/materials/case-a/tampered-receipt
```

The second command is expected to fail and name one evidence file. Do not browse the example URLs; they are reserved synthetic paths and factual web research is outside this study.

## Record without identity data

Copy [`fixtures/example-response.json`](fixtures/example-response.json) outside the repository, set `fixture` to `false`, choose a random non-identifying ID such as `p-` plus eight hexadecimal characters, and record consent choices separately from identity. The schema refuses direct name, email, handle, address, credential, session, and prompt fields. Free-text friction and feedback still require human redaction review.

Raw response JSON is ignored under `responses/` by default. Do not commit it merely because `publishAnonymizedRow` is true; that consent allows review, not automatic publication.

```bash
npm run study:reviewer -- validate /private/path/p-1234abcd.json
npm run study:reviewer -- aggregate /private/path/responses --format=markdown
```

## Optional public handoff

The web lab unlocks a link to the dedicated [reviewer-study result form](https://github.com/OthmaneBlial/web-task-agent/issues/new?template=reviewer_value_study.yml) only after a response has been downloaded with `publishAnonymizedRow` consent. The link is a manual handoff, not a submission endpoint: the page never opens it automatically and never sends or attaches the JSON.

Before opening a public issue:

1. validate the exported response with the command above;
2. inspect every JSON field and remove any identifying or private free text;
3. confirm `fixture` is `false`, `anonymizedMeasures` is `true`, and `publishAnonymizedRow` is `true`;
4. understand that the GitHub issue is public and linked to the submitting GitHub account;
5. attach the file manually only if that public linkage is acceptable.

If public account linkage is not acceptable, do not open the form. A maintainer-held private consent record must be coordinated separately before any count or aggregate changes.

Aggregation excludes fixtures and responses without `anonymizedMeasures` consent. It publishes numerator/denominator pairs, abandoned trials, medians, exclusions, and limits. It performs no significance test and emits no superiority claim.

## Rebuild and verify the materials

```bash
npm run generate:reviewer-study
npm test
```

The checked-in example response is synthetic (`fixture: true`) and never increments external-use, retention, or case-study metrics. Current real participant count: **0**.
