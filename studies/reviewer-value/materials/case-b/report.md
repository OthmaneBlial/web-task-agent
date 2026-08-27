# Automated dependency-update decision

**Question:** Should the repository enable automatic dependency updates now?

**Decision:** Enable grouped patch updates, block automatic majors, and measure patch latency before claiming improvement.

## Claims

| Claim ID | Status | Evidence link | Limitation |
| --- | --- | --- | --- |
| grouped-patch-updates | supported | evidence-update-policy → update-policy (supports) | — |
| automatic-majors-safe | contradicted | evidence-upgrade-incident → upgrade-incident (contradicts) | — |
| patch-latency-halved | insufficient | evidence-update-context → update-policy (context) | Neither synthetic source contains before-and-after merge-latency measurements. |

## Sources

### update-policy — Synthetic dependency-update policy

- URL: https://example.com/studies/dependency-update-policy
- Collected: 2026-08-19T10:00:00.000Z
- Excerpt: “Patch updates can be grouped weekly while major versions remain blocked for manual compatibility review.”

### upgrade-incident — Synthetic major-upgrade incident note

- URL: https://example.com/studies/dependency-upgrade-incident
- Collected: 2024-02-10T10:00:00.000Z
- Excerpt: “An automated major upgrade broke the plugin API and required a rollback before the next release.”

## Strongest contradiction

The incident note directly contradicts unattended major-version safety.

## Limitations

- All sources and scenarios are synthetic study fixtures.
- Source upgrade-incident is intentionally stale.
- A Markdown report has no integrity manifest, so unchanged bytes cannot be established from this file alone.

## Smallest next validation

Run grouped patch-only updates for four weeks and record merge latency, rollback count, and maintainer time.
