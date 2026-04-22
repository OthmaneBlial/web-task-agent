# Examples

## Example 1: Research A New Android App Idea

Goal:

- search across product pages, reviews, communities, and competitor discussions
- save evidence locally
- analyze repeated pains and feature gaps
- hand back concept ideas that could have strong momentum

Command:

```bash
npm run start -- workflow run android-opportunity \
  --topic "ai study planner" \
  --preset deep
```

Use this when you want an evidence-backed concept package instead of casual browsing.

## Example 2: Research A Technical Topic For An Article

Goal:

- scan docs, blog posts, release notes, and discussions
- preserve contradictions instead of flattening them
- generate article angles and a claim checklist

Command:

```bash
npm run start -- workflow run article-research \
  --topic "browser automation with Lightpanda and CDP"
```

Use this when the final output is not just research, but better writing based on that research.

## Example 3: Queue A Long Run And Process It Later

Goal:

- enqueue the job now
- let a worker claim it later
- retain resume and recovery behavior if interrupted

Commands:

```bash
npm run start -- workflow enqueue android-opportunity \
  --topic "budgeting app for couples"
npm run start -- worker run --once
```

## Example 4: Run A One-Off General Research Job

Goal:

- use the durable pipeline without forcing the job into a predefined template

Command:

```bash
npm run start -- agent run \
  "Research cheerful launch ideas for our product and write one evidence-backed post"
```

## Example 5: Inspect A Job While It Runs

Commands:

```bash
npm run start -- server run --port 4317
npm run start -- job inspect <job-id>
npm run start -- job logs <job-id> --limit 100
```

This is useful when a run is long enough that you want real operator visibility instead of waiting blindly.

## Example 6: Export Logs For Later Review

Command:

```bash
npm run start -- job logs <job-id> --limit 250 --output ./job-logs.txt
```

Use this when you want to share or archive a long log history without losing the exact event ordering.

## Example 7: Discover A Workflow Before Launching It

Command:

```bash
npm run start -- workflow list
```

Use this when you want to compare `fast`, `standard`, and `deep` before picking the launch option that fits the job.
