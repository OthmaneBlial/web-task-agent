# Deterministic fixture snapshot — Web Task Agent security policy

- URL: https://github.com/OthmaneBlial/web-task-agent/blob/main/SECURITY.md
- Publisher: Web Task Agent
- Captured: 2026-08-26
- Capture type: fixture-synthetic

This snapshot is bundled evidence for the deterministic demo. It is not a live copy of the linked page.

Scenario: Review a local research run for unsafe targets, secret exposure, source manipulation, and unsafe sharing before treating its output as ready.

# Local-First Risk Review

## Decision

Treat browser pages, search snippets, files, and LLM responses as untrusted inputs. Keep operator approval at the boundary where data leaves the machine or a sensitive action could occur.

## Required controls

- Reject private-network and credential-bearing URLs before fetch.
- Respect declared source policy and do not bypass access controls or CAPTCHAs.
- Detect instructions embedded in web content and keep them separate from the operator's task.
- Redact secrets from persisted logs, reports, and prompt traces.
- Preview and redact exports before sharing a package.

## Residual risk

Local-first does not mean offline: selected content may be sent to the configured LLM endpoint. The operator must understand and approve that boundary.

## Next validation

Run source-policy and redaction tests for every new fetcher, output writer, and provider adapter.
