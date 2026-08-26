# Privacy and local-data contract

Web Task Agent is local-first: it has no required hosted control plane and does not include product analytics or background telemetry.

## What stays on the operator's machine

- Job state, queue state, source metadata, evidence links, and artifact metadata are stored in the local SQLite database.
- Resumable caches, reports, workflow packages, prompt traces, and exports are written to local paths chosen by the operator.
- The local dashboard listens on `127.0.0.1` by default.
- `job export` and `job compare` only write local files; they do not upload or synchronize a package.

## What can leave the machine

Live research intentionally contacts public web sources through the configured browser/CDP runtime. When an LLM-backed job is run, selected instructions and research content are sent to the LLM endpoint configured by the operator. The bundled demos, catalog, pack plans, previews, scaffolds, and standard test suite do not need an LLM key.

You are responsible for choosing an endpoint and credentials appropriate for the data you include in a job. Do not put secrets, customer data, private URLs, browser cookies, or regulated material into an instruction unless the configured model provider and your policy explicitly allow it.

## Source acquisition safeguards

- URLs that are malformed, credential-bearing, local, private-network, or explicitly blocked are refused before browser navigation.
- Public source paths are checked against `robots.txt` when it is available, with a configurable per-domain delay; an unsafe redirect target is quarantined before its content is extracted or persisted.
- Page text is treated as untrusted; suspected prompt-injection instructions are quarantined from extraction.
- Configure `WEB_TASK_AGENT_ALLOWED_DOMAINS`, `WEB_TASK_AGENT_BLOCKED_DOMAINS`, `WEB_TASK_AGENT_DOMAIN_MIN_DELAY_MS`, and `WEB_TASK_AGENT_USER_AGENT` for tighter operating boundaries.

An unavailable `robots.txt` is recorded as a signal and rate limiting still applies; it is not a claim that a site granted permission. Respect applicable law, terms, and access controls.

## Redaction, retention, and deletion

Structured logs and prompt traces redact common API, GitHub, AWS, and bearer-token formats. Before sharing, use `web-task-agent job export <job-id> --redact --dry-run` to inspect the local export plan. Redaction is defense in depth, not a substitute for reviewing sensitive data.

Prompt-trace manifests can be bounded with `web-task-agent storage cleanup --prompt-traces <path> --max-traces <count>`. Create a consistent local SQLite backup with `storage backup --output <path>` before a risky local change; `storage restore --input <path> --force` keeps a safety copy before replacement. Delete local reports, cache files, and the SQLite database through your normal local retention process when they are no longer needed. The project does not retain a remote copy on your behalf.

Before making the repository public or cutting a release, run `npm run audit:secrets`. It scans tracked and non-ignored candidate files, confirms that `.env`, `.data/`, and `reports/` remain ignored, and reports only locations and credential categories. It cannot prove that a secret never existed in Git history; rotate anything that may previously have been committed.

## Contact

For a vulnerability, follow [SECURITY.md](SECURITY.md). For product support, see [SUPPORT.md](SUPPORT.md).
