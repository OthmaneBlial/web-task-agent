# Testing And Roadmap

## Current Automated Coverage

The repo currently includes automated tests for:

- queue recovery
- job controls
- management API controls and endpoints
- prompt traces
- research quality filters and extractor behavior
- workflow output packaging
- interrupted agent checkpoints

At the time this site was generated, the suite has **13 tests** and covers many of the highest-risk local operator paths.

## Current Macro Roadmap Position

Most of the large platform milestones are already complete:

- browser and task foundation
- durable job execution
- deep research pipeline
- durable storage and reuse
- evidence analysis layer
- workflow templates
- queue and worker mode
- API and dashboard
- job controls and live logs
- research quality hardening
- workflow output polish

## Remaining Macro Area

The remaining macro item is:

- `Tests And Production Hardening`

This is intentionally **local-first**, not a scale-out or hosted deployment roadmap. The current remaining emphasis is:

- broader failure-mode coverage
- stronger recovery and debug artifacts for long local runs
- tighter verification around workflow and runtime outputs

## Repo Source Pages

This site also includes copied versions of:

- the repository `README.md`
- the repository `ROADMAP.md`
- the two workflow example files

Use those when you want the exact project-authored source text inside the portable site.
