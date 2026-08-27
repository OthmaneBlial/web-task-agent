# External validation protocol

The repository currently has maintainer-produced proofs and no claimed external adoption baseline. This protocol lets real reviewers test usefulness without hidden telemetry or pressure to report a positive outcome.

Volunteers can coordinate through [issue #12](https://github.com/OthmaneBlial/web-task-agent/issues/12). The maintainer-authored invitation is not a participant, case study, or usage event.

## Three case-study tracks

Recruit one consenting participant for each track before calling the set complete:

1. **PR or RFC review** — attach a receipt to a real review and record whether the reviewer can trace one claim and one contradiction.
2. **Decision change** — compare two receipts for the same decision and record what evidence, policy, model, claim, or conclusion changed.
3. **External-agent import** — map an authentic redistributable output from an existing engine through the adapter contract and preserve its limitations.

At least one published case must remain `insufficient` or leave the decision unchanged. Negative and neutral outcomes are first-class results.

## Required case record

- participant role and prior familiarity, generalized when anonymity is requested;
- consent state and exactly which artifacts may be public;
- question, input boundary, source policy, engine/model, receipt, and command/version;
- strongest contradiction, decision, invalidation condition, and smallest next validation;
- review time measured from a stated start/end rule;
- critical feedback and friction, including abandonment;
- redactions and material that remains private.

Never publish credentials, cookies, browser profiles, private URLs, proprietary source text, prompt traces, personal data, or a participant's identity without explicit permission.

## Reviewer-value comparison

Use a small counterbalanced comparison rather than presenting a demo as a study:

- prepare the same bounded report in Markdown-only and Markdown-plus-receipt conditions;
- alternate condition order between participants;
- ask the reviewer to find evidence for a claim, identify a contradiction, detect stale evidence, and detect one controlled falsification;
- measure completion time and correctness separately;
- collect declared confidence after the task, not as a substitute for correctness;
- publish the full task, scoring rule, denominator, missing data, anonymized consented rows, and limitations.

Do not claim a speed, accuracy, or confidence improvement unless the observed data supports it. With very small samples, publish descriptive results rather than significance theater.

## Consent checkpoints

Consent is granular: participation, anonymized measures, public receipt, public quote, and identity attribution are separate choices. A participant may withdraw unpublished data. Already-merged open-source contributions remain governed by their repository license and Git history.

## Current baseline

| Measure | Count |
| --- | ---: |
| Consenting external case studies | 0 |
| External receipts verified | 0 |
| External users producing a second receipt/diff | 0 |
| Independent security reviews received | 0 |

Update these counts only with a public link or a private consent record held by the maintainer. Stars, clones, maintainer runs, synthetic fixtures, and this protocol do not increment them.
