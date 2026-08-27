# Opt-in public receipt gallery

This gallery accepts only voluntarily submitted, redistributable, redacted Decision Receipts. It has no crawler, upload service, analytics, background collection, or automatic enrolment. An empty gallery is preferable to publishing an artifact without consent.

## Entry contract

Each entry uses `gallery/<slug>/` and includes:

- `gallery-entry.json`, validated against [gallery-entry.schema.json](gallery-entry.schema.json);
- `receipt/receipt.json`, `receipt/integrity-manifest.json`, and only redistributable snapshots;
- `README.md` describing reproduction, limitations, redactions, license, and invalidation;
- a license or permission statement that covers the contributor-authored material.

The entry metadata records contributor consent, artifact license, receipt spec version, reviewed commit, redaction state, and whether identity attribution is allowed. A source URL being public does not automatically license its full content for redistribution; keep excerpts minimal and review source terms.

## Submission and removal

Use the **Public receipt gallery** issue form before opening a pull request. Maintainers verify the receipt offline, review every tracked byte, run the secret audit, and confirm that the submitter is authorized to share the material. The receipt must include limitations and the smallest next validation.

Before merge, a submitter may withdraw the entry. After merge, removal uses a normal pull request so public Git history remains honest; urgent privacy or security removal is coordinated privately. The gallery does not promise that Git history, forks, caches, or third-party archives can be erased.

## Prohibited content

- credentials, cookies, tokens, private keys, browser profiles, session identifiers, or authenticated URLs;
- personal, customer, employer-confidential, or contract-restricted data;
- prompt traces or provider-private reasoning;
- copied articles, paywalled text, or snapshots without redistribution permission;
- badges or claims that integrity verification proves truth, authorization, representativeness, or freshness.

No entry exists yet. The first merge must be a real opt-in contribution and must not be manufactured to make the gallery look active.
