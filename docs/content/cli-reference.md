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
web-task-agent queue stats
web-task-agent job logs <job-id> --limit 100
web-task-agent job report <job-id>
web-task-agent storage maintain
web-task-agent worker run --once
web-task-agent server run --port 4317
```

## What To Use First

- `workflow list` when you want a template-oriented entry point.
- `workflow run` when you want a full research package immediately.
- `agent run` when you want a free-form instruction without a template.
- `queue list` and `job logs` when you are already operating a long run.
- `queue stats` when you want a quick status snapshot without scanning each queue item.
- `storage maintain` when you want database counts or a vacuum pass.

## Output Conventions

The commands print stable labels for:

- `Job ID`
- `Queue ID`
- `Job DB`
- `Cache`
- `Report`
- `Artifacts`

Those labels make it easier to copy values into follow-up commands or inspect paths in the filesystem.

## Artifact Discovery

Use `job inspect <job-id>` when you want to see:

- the stored job summary
- the report path
- the artifact directory
  - the artifact keys and file paths
  - the number of stored steps and evidence graph nodes

## Recovery Reports

Use `job report <job-id>` when you want a compact recovery-focused summary that highlights:

- whether the job is recoverable right now
- the recommended next command
- the latest stored events and error message

## Log Export

Use `job logs <job-id> --output <path>` to write the recent event history to a file for later review or sharing.

## Failure Messages

Most command failures now print a short action-oriented hint. The goal is to point you to the next useful command or missing environment variable instead of dumping a raw stack trace first.

## Environment Validation

Job-launching commands fail fast when the API key is missing. Set one of:

- `ANTHROPIC_API_KEY`
- `ZAI_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`

before running `agent`, `workflow`, `github`, `playstore`, or `worker` commands.
