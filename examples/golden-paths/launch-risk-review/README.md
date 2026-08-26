# Launch Risk Review

## When to use it

Use this path before announcing a developer product or workflow. It turns launch copy into a reviewable decision: what a visitor can reproduce, what evidence supports the promise, which assumptions remain, and what would stop the launch.

## Run it

```bash
web-task-agent workflow run cybersecurity-launch-positioning \
  --topic "local evidence-backed research tool release" \
  --preset focused
```

Use this instead of treating a polished announcement or a green CI badge as proof that a new visitor will succeed.

## Expected package

```text
<run-directory>/
├── receipt.json
├── integrity-manifest.json
├── report.md
├── handoff/
│   ├── README.md
│   ├── workflow-brief.md
│   └── package-manifest.json
└── raw/research/
```

Open the [rendered fixture receipt](receipt.html), then inspect the claim evidence and the explicit invalidation conditions.

## What could invalidate the decision

The release path can fail on a clean machine, the current docs can drift from the tag, or feedback can show that a simpler research note is more useful. Re-run the first-success check and ask for disconfirming feedback before expanding the launch.
