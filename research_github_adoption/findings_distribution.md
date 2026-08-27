# Findings — activation and distribution

## Distribution surfaces supported by current primary documentation

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) supports short-lived OIDC publishing from GitHub Actions and automatic provenance for eligible public packages. It removes the need for a long-lived registry write token, but still requires package-owner configuration and a compatible workflow.
- A repository-local GitHub Actions workflow keeps the integrity gate, fixtures, and reviewed core in one place. This project deliberately uses that model instead of creating an auxiliary repository.
- The [official MCP Registry quickstart](https://modelcontextprotocol.io/registry/quickstart) distributes metadata rather than artifacts, requires the underlying TypeScript server package to be published first, and remains in preview.
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) is a suitable machine-readable boundary for a versioned receipt contract, with language-neutral validators and conformance fixtures.

## Highest-leverage activation sequence

1. Extract a dependency-light receipt schema, validator, renderer, and comparer from the full CLI.
2. Add a client-only web verifier where a visitor can inspect their own local receipt without upload or analytics.
3. Publish the verifier/CLI through an unauthenticated public package path with provenance.
4. Ship a read-only GitHub Actions workflow in this repository that validates receipts in pull requests.
5. Prove authentic interoperability with external engines, then expose the same local operations through MCP or an agent skill.
6. Launch each surface with one concrete, reproducible artifact and invite review of the evidence rather than asking for stars.

## Growth loop

The defensible loop is artifact-driven: an agent produces research, the user turns it into a receipt, CI verifies or diffs it, reviewers challenge specific evidence, those challenges become fixtures or adapters, and the receipt/CI link exposes the project to the next user.

Stars can follow that loop, but they cannot substitute for it.
