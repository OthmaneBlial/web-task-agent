#!/usr/bin/env python3
"""Run one bounded GPT Researcher report and print a privacy-safe JSON projection."""

import asyncio
import hashlib
import importlib.metadata
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from gpt_researcher import GPTResearcher


SOURCE_URL = "https://github.com/OthmaneBlial/web-task-agent/blob/main/docs/content/trust-model.md"
SOURCE_EXCERPT = (
    "Verification is offline and deterministic. A valid status means the package is internally consistent; "
    "it is not a fact-check, freshness guarantee, or authorization check."
)


async def main() -> None:
    source_path = Path("docs/content/trust-model.md")
    source_text = source_path.read_text(encoding="utf-8")
    if SOURCE_EXCERPT not in source_text:
        raise RuntimeError(f"expected excerpt is missing from {source_path}")

    started = datetime.now(timezone.utc)
    context = (
        "Title: Decision Receipt trust boundary\n"
        f"Content: {SOURCE_EXCERPT}\n"
        f"Source: {SOURCE_URL}"
    )
    researcher = GPTResearcher(
        query="What narrow conclusion follows from the supplied Decision Receipt trust boundary?",
        report_type="research_report",
        report_source="local",
        context=[context],
        verbose=False,
        mcp_strategy="disabled",
    )
    report = await researcher.write_report(
        custom_prompt=(
            "/no_think Use only the supplied context. Write no more than 120 words with exactly these headings: "
            "# Finding, ## Evidence, ## Limitation, ## Next validation. Quote the supplied source excerpt "
            "once. Do not claim that integrity proves truth."
        )
    )
    raw_report_sha256 = hashlib.sha256(report.encode("utf-8")).hexdigest()
    report_projection, redactions = re.subn(r"<think>[\s\S]*?</think>", "", report, flags=re.IGNORECASE)
    report_projection = report_projection.strip()
    if "<think" in report_projection.lower() or "</think" in report_projection.lower():
        raise RuntimeError("unclosed reasoning trace remained after redaction")

    result = {
        "engine": "GPT Researcher",
        "engineVersion": importlib.metadata.version("gpt-researcher"),
        "runId": researcher._generate_research_id(),
        "startedAt": started.isoformat().replace("+00:00", "Z"),
        "finishedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "query": researcher.query,
        "reportType": researcher.report_type,
        "reportSource": researcher.report_source,
        "model": "qwen3:0.6b-q4_K_M via local Ollama",
        "source": {
            "title": "Decision Receipt trust boundary",
            "url": SOURCE_URL,
            "excerpt": SOURCE_EXCERPT,
            "documentSha256": hashlib.sha256(source_text.encode("utf-8")).hexdigest(),
        },
        "reportProjection": report_projection,
        "rawReportSha256": raw_report_sha256,
        "reasoningRedacted": redactions > 0,
        "visitedUrls": sorted(researcher.visited_urls),
        "estimatedCostUsd": researcher.get_costs(),
        "runtimePatch": (
            "PyPI gpt-researcher 0.16.0 query_processing.py typing imports were moved before "
            "the first Any annotation to match the upstream source import order."
        ),
        "warnings": [
            "The optional MCPRetriever dependency was unavailable; MCP was explicitly disabled.",
            "estimatedCostUsd is GPT Researcher's static estimate, not a billed local Ollama charge.",
        ],
        "limits": {
            "preloadedRedistributableContext": True,
            "retrievalSkippedToAvoidSecondEmbeddingModel": True,
            "webSearch": False,
            "mcp": False,
            "authenticatedSession": False,
            "rawReasoningPublished": False,
        },
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
