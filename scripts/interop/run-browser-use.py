#!/usr/bin/env python3
"""Capture one bounded, redistributable Browser Use run as JSON on stdout."""

import asyncio
import importlib.metadata
import json
from datetime import datetime, timezone

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.dom.markdown_extractor import extract_clean_markdown
from ollama import AsyncClient


SOURCE_URL = "https://example.com/"
MODEL = "qwen3:0.6b-q4_K_M"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


async def main() -> None:
    started_at = utc_now()
    session = BrowserSession(
        browser_profile=BrowserProfile(
            executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            headless=True,
            allowed_domains=["example.com"],
            enable_default_extensions=False,
            user_data_dir=None,
        )
    )
    await session.start()
    try:
        await session.navigate_to(SOURCE_URL)
        state = await session.get_browser_state_summary(include_screenshot=False)
        markdown, stats = await extract_clean_markdown(session, extract_links=True, extract_images=False)
    finally:
        await session.stop()

    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "heading": {"type": "string"},
            "paragraph": {"type": "string"},
            "claim": {"type": "string"},
        },
        "required": ["heading", "paragraph", "claim"],
    }
    prompt = (
        "/no_think\nUse only the captured markdown below. Return the exact H1 as heading, "
        "the exact paragraph as paragraph, and one short claim saying the page is explicitly for "
        "documentation examples. Do not add facts.\n\n" + markdown
    )
    response = await AsyncClient(timeout=120).chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        format=schema,
        options={"temperature": 0, "num_ctx": 4096},
        think=False,
    )
    model_output = json.loads(response.message.content or "{}")
    result = {
        "engine": "Browser Use",
        "engineVersion": importlib.metadata.version("browser-use"),
        "runId": f"browser-use-{started_at.strftime('%Y%m%dT%H%M%SZ')}",
        "startedAt": iso(started_at),
        "finishedAt": iso(utc_now()),
        "browser": "Google Chrome (local headless, isolated temporary profile)",
        "model": f"{MODEL} via local Ollama",
        "source": {
            "url": state.url,
            "title": state.title,
            "markdown": markdown,
            "markdownStats": stats,
        },
        "modelOutput": model_output,
        "limits": {
            "allowedDomains": ["example.com"],
            "telemetry": False,
            "cloudSync": False,
            "authenticatedSession": False,
            "screenshotCaptured": False,
        },
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
