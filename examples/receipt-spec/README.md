# Decision Receipt examples

Each directory is a complete offline bundle:

- `minimal`: required review contract with producer-specific provenance left null;
- `full`: declared workflow, policy, prompt, model, run, and CLI provenance;
- `contradicted`: a claim with an explicit contrary evidence relation;
- `incomplete`: an `insufficient` claim and the missing validation step;
- `stale`: structurally valid evidence whose collection date is deliberately old;
- `signed`: deterministic Ed25519 test signature (the embedded example key is never for production use);
- `tampered`: one snapshot byte sequence changed after the manifest was created and must fail verification.

Integrity validity is not a truth judgment. Even the valid fixtures use synthetic evidence.
