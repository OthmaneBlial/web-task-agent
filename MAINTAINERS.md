# Maintainers and v1 change policy

## Current maintainership

| Maintainer | GitHub | Responsibilities |
| --- | --- | --- |
| Othmane Blial | [@OthmaneBlial](https://github.com/OthmaneBlial) | Releases, security coordination, specification stewardship, repository administration |

This table records current authority; it is not a claim of independent review or a multi-maintainer project. New maintainers are added only after repeated, reviewable contributions and explicit public acceptance.

## Review boundaries

- A maintainer may merge an implementation change after its tests, generated artifacts, documentation, and privacy boundary agree.
- A breaking receipt change cannot be merged only by editing code. It requires the public [RFC process](docs/rfcs/README.md), compatibility impact, migration, conformance cases, and release plan.
- Security reports follow [SECURITY.md](SECURITY.md). Reproductions that could expose users or bypass a boundary stay private until coordinated disclosure.
- Authentic interoperability artifacts must retain engine version, run ID when available, redistributable input, origin labels, limitations, and reproduction instructions.
- External case studies and gallery entries require contributor consent. Maintainers do not scrape or auto-enrol public receipts.

## Compatibility policy

The normative policy is in [COMPATIBILITY.md](COMPATIBILITY.md):

- patch releases clarify or repair without changing the accepted v1 document contract;
- minor releases may add optional semantics and conformance cases;
- major releases may reject prior documents and require an approved RFC plus an explicit migration;
- readers fail closed on an unknown major version;
- the current writer emits `1.0.0`, while N-1 experimental receipts have a tested migration path.

Canonical JSON bytes, signature payloads, path safety, integrity-manifest semantics, required fields, and the meaning of an existing status are compatibility surfaces even if TypeScript types do not change.

## Release rules

1. Pin the candidate commit and run `npm run release:check` from a clean checkout.
2. Review the exact npm tarballs, public examples, generated site, secrets audit, production dependency audit, and migration/conformance results.
3. Publish from a protected tag through the release workflow; a local build is not release proof.
4. Verify the tag, GitHub release assets, checksums, attestations, clean install, first-success path, and supported Node matrix.
5. For npm, separately verify the public registry record, trusted-publisher provenance, and tokenless `npx` path. Until that happens, npm remains an open gate.
6. Record known limits and untested surfaces in the release notes. Do not label a release `v1.0.0` until every gate in [ROADMAP.md](ROADMAP.md) is evidenced.

Emergency security releases may shorten public RFC discussion, but they still require a private rationale, regression test, compatibility note, and coordinated advisory when applicable.

## Adding or removing a maintainer

A candidate should have several merged contributions across at least two of implementation, conformance/security, documentation, adapters, or release verification. The existing maintainer records the decision in a focused pull request. Removal for inactivity is administrative and does not erase authorship; removal for a security concern may be handled privately first and documented when safe.
