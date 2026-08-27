# Launch kit — Web Task Agent v0.5.1

This is a factual launch kit for maintainers. Lead with an inspectable artifact, keep the limitations attached, and never claim adoption, truth, accuracy, or freshness that has not been independently demonstrated.

## The short version

Web Task Agent is the verification layer for AI research. It turns a run from a research agent into a local Decision Receipt with claims, source excerpts, contradictions, integrity, and the next validation still attached.

Inspect the deterministic receipt before installing anything:

- Receipt: https://othmaneblial.github.io/web-task-agent/receipt.html
- Project: https://othmaneblial.github.io/web-task-agent/

Run the same package locally without an API key or browser:

```bash
curl -fsSLO https://github.com/OthmaneBlial/web-task-agent/releases/download/v0.5.1/web-task-agent-0.5.1.tgz
curl -fsSLO https://github.com/OthmaneBlial/web-task-agent/releases/download/v0.5.1/SHA256SUMS
shasum -a 256 -c SHA256SUMS
npm install --global ./web-task-agent-0.5.1.tgz

web-task-agent demo export browser-agent-landscape
web-task-agent receipt verify reports/demos/browser-agent-landscape
open reports/demos/browser-agent-landscape/receipt.html
```

The checksum proves artifact integrity. It does not prove that a source, claim, or decision is true.

## Links to share

- Featured Decision Receipt: https://othmaneblial.github.io/web-task-agent/receipt.html
- Project site: https://othmaneblial.github.io/web-task-agent/
- Source and installation: https://github.com/OthmaneBlial/web-task-agent#readme
- Release `v0.5.1`: https://github.com/OthmaneBlial/web-task-agent/releases/tag/v0.5.1
- Receipt evaluation: https://github.com/OthmaneBlial/web-task-agent/blob/main/evaluation/scorecard.md
- Trust model: https://github.com/OthmaneBlial/web-task-agent/blob/main/docs/content/trust-model.md
- Contributing: https://github.com/OthmaneBlial/web-task-agent/blob/main/CONTRIBUTING.md

## Show HN draft — hold until the launch gate passes

**Title:** Show HN: Web Task Agent – offline verification and diffs for AI research decisions

**Body:**

I built Web Task Agent for research that has to survive scrutiny after the agent stops. It turns a run into a portable Decision Receipt: each material claim stays linked to source excerpts, contradictions and limitations remain visible, and an offline verifier checks structure, snapshots, hashes, and optional signatures.

The featured receipt is deterministic and opens without a key, browser session, account, analytics, or live request:

https://othmaneblial.github.io/web-task-agent/receipt.html

The project also includes a local research runner, but the part I most want challenged is the receipt contract: can a skeptical reviewer find the evidence, identify what could invalidate the decision, and understand what changed between two runs?

I would especially value a falsification attempt or a real agent output that the provider-neutral importer fails to preserve. A valid hash or signature does not make the decision true; it only narrows what changed and who attested to the bytes.

## Audience-specific angles

| Audience | Lead with | Ask for |
| --- | --- | --- |
| Agent builders | Provider-neutral receipt import and claim-to-evidence contract | One authentic output the adapter should preserve |
| Maintainers | Offline verification and decision diffs for PR/RFC review | A falsification or compatibility case |
| Product/research teams | Contradictions, freshness, limitations, and next validation | A repeated decision worth comparing |
| Local-first teams | No hosted verifier, no required telemetry, explicit model boundary | Review of the local data flow |
| Contributors | Conformance fixtures, policy cases, and bounded adapters | One reproducible fixture or test |

## Launch gate

Do not post broadly until all applicable checks are true:

- [ ] `npm run release:check` passes from a clean `main` checkout.
- [ ] The exact release tarball installs in a new temporary directory.
- [ ] `receipt verify` succeeds for the clean demo and fails for the tampered fixture.
- [ ] Project site, receipt, release, checksum, and provenance links return successfully in a signed-out browser.
- [ ] The launch text distinguishes deterministic fixtures from authentic live research.
- [ ] Every benchmark or adoption number has a public source, denominator, and limitation.
- [ ] The call to action asks for evidence review or an authentic compatibility case, not an empty star request.

## After a launch artifact is shared

- Record only public links and consented aggregate signals; never collect prompts, private reports, cookies, API keys, browser profiles, or source contents.
- Convert actionable criticism into a fixture, test, adapter issue, threat-model update, or documented non-goal.
- Stop promotion if attention does not produce clean installs, verified receipts, repeated diffs, or useful contributions.
