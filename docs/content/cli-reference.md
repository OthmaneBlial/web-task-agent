# CLI Reference

The root help output is organized around the main operator paths:

- workflow discovery and execution
- general agent research jobs
- queue inspection and controls
- job inspection and controls
- worker execution
- local dashboard and API

## Common Commands

```bash
web-task-agent workflow list
web-task-agent workflow run <template> --topic <text>
web-task-agent workflow enqueue <template> --topic <text>
web-task-agent agent run <instruction>
web-task-agent agent enqueue <instruction>
web-task-agent queue list
web-task-agent job logs <job-id> --limit 100
web-task-agent worker run --once
web-task-agent server run --port 4317
```

## What To Use First

- `workflow list` when you want a template-oriented entry point.
- `workflow run` when you want a full research package immediately.
- `agent run` when you want a free-form instruction without a template.
- `queue list` and `job logs` when you are already operating a long run.

## Output Conventions

The commands print stable labels for:

- `Job ID`
- `Queue ID`
- `Job DB`
- `Cache`
- `Report`
- `Artifacts`

Those labels make it easier to copy values into follow-up commands or inspect paths in the filesystem.

## Environment Validation

Job-launching commands fail fast when the API key is missing. Set one of:

- `ANTHROPIC_API_KEY`
- `ZAI_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`

before running `agent`, `workflow`, `github`, `playstore`, or `worker` commands.
