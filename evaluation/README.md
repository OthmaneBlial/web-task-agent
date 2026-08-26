# Evaluation corpus

This corpus is a regression contract for the decision-receipt surfaces. It is intentionally small, deterministic, and inspectable in Git. It is not a benchmark of model intelligence, web coverage, or truthfulness.

## Run it

```bash
npm run evaluate:receipts
```

The command validates every receipt under `examples/receipts/` and writes:

- `evaluation/scorecard.json` — machine-readable denominators, rates, and gate results;
- `evaluation/scorecard.md` — a reviewable summary with the exact corpus and limits.

The eight receipt fixtures are synthetic demonstrations. A passing structural gate means that claim references, source snapshots, integrity hashes, limitations, and next validations remain present and internally consistent. It does not mean that the web claims are current or correct.

## Adversarial cases

The `adversarial/` fixtures describe hostile inputs that must stay inside the existing trust boundaries:

- unsafe source protocols and credential-bearing URLs are denied;
- prompt-injection text is flagged as evidence, never executed as an instruction;
- private or documentation-range DNS answers are denied before browser navigation;
- stale or incomplete evidence keeps an explicit limitation instead of being promoted to certainty.

Each case names its expected gate and the corresponding test. Add a minimal fixture and a regression test before changing a policy rule.
