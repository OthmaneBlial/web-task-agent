# Workflow Templates

The repository currently ships two built-in workflow templates.

## 1. Android Opportunity Research

Purpose:

- Find promising Android app opportunities
- Extract recurring pains and gaps from product and community sources
- Produce concept ideas, MVP hooks, monetization clues, and launch angles

Example command:

```bash
npm run start -- workflow run android-opportunity \
  --topic "ai study planner" \
  --preset deep
```

Default presets:

- `fast`
- `standard`
- `deep`

The preset changes:

- max queries
- max results per query
- fetch batch size
- max runtime hours

## 2. Technical Article Research

Purpose:

- Research a technical topic that is discussed across docs, blogs, release notes, issues, and commentary
- Preserve the strongest repeated claims and the contradictions
- Produce article angles and a claim checklist before writing

Example command:

```bash
npm run start -- workflow run article-research \
  --topic "browser automation with Lightpanda and CDP"
```

## Shared Workflow Behavior

Both templates:

- generate a topic-shaped instruction automatically
- write outputs to stable topic-based folders
- register artifacts in SQLite
- write workflow briefs and package manifests
- support queueing and worker execution

## Queue A Workflow Instead Of Running It Immediately

```bash
npm run start -- workflow enqueue android-opportunity \
  --topic "budgeting app for couples"
```

## Workflow Package Structure

```text
report.md
handoff/
  README.md
  package-manifest.json
  research-summary.md
  workflow-brief.md
drafts/
  post-draft.md
  comments-draft.md
plan/
  plan.json
raw/
  research/
runtime/
  llm-prompt-traces.json
  pipeline-manifest.json
```

## Repo Example Files

- `examples/workflows/android-opportunity.md`
- `examples/workflows/article-research.md`

Those files are also copied into this site under the repo source pages.
