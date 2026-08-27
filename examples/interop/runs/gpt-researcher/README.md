# Authentic GPT Researcher run

This directory records a real, bounded GPT Researcher `0.16.0` execution from 2026-08-27. The engine received one exact, redistributable excerpt from this repository's trust model and generated a short local report with the already-installed Ollama `qwen3:0.6b-q4_K_M` model (523 MB). It is not a synthetic fixture.

The checked-in `engine-output.json` is a privacy-safe projection. The 0.6B model emitted a `<think>` block despite the `/no_think` instruction, so the runner removes that block, publishes only the SHA-256 of the full raw report, and fails if an unclosed reasoning tag remains. No prompt trace, credential, session, private URL, or raw reasoning is committed.

## Disk-bounded reproduction

The Python environment measured about 807 MB during the recorded run. It is temporary and can be deleted after reproduction. The run deliberately supplies public context directly and skips retrieval, preventing installation or download of a second embedding model. It reuses the same 523 MB Ollama model as the Browser Use proof.

PyPI package `0.16.0` currently places `typing.Any` below its first annotation in `query_processing.py`, which raises `NameError` during import. The tiny checked-in preparer verifies the exact broken shape and moves only `logging` and `typing` imports to the top, matching the current upstream import order. It fails closed on an unexpected package file.

```bash
python3.12 -m venv /tmp/decision-receipt-gpt-researcher
/tmp/decision-receipt-gpt-researcher/bin/pip install \
  -r scripts/interop/gpt-researcher-requirements.txt

/tmp/decision-receipt-gpt-researcher/bin/python \
  scripts/interop/prepare-gpt-researcher.py

FAST_LLM='ollama:qwen3:0.6b-q4_K_M' \
SMART_LLM='ollama:qwen3:0.6b-q4_K_M' \
STRATEGIC_LLM='ollama:qwen3:0.6b-q4_K_M' \
EMBEDDING='ollama:qwen3:0.6b-q4_K_M' \
OLLAMA_BASE_URL='http://127.0.0.1:11434' \
REPORT_SOURCE='local' \
DOC_PATH='/tmp/decision-receipt-gpt-researcher-docs' \
FAST_TOKEN_LIMIT='600' SMART_TOKEN_LIMIT='800' STRATEGIC_TOKEN_LIMIT='600' \
TOTAL_WORDS='120' MAX_ITERATIONS='1' MAX_SUBTOPICS='1' TEMPERATURE='0' \
CURATE_SOURCES='false' IMAGE_GENERATION_ENABLED='false' VERBOSE='false' \
/tmp/decision-receipt-gpt-researcher/bin/python \
  scripts/interop/run-gpt-researcher.py
```

The package logs that its optional `MCPRetriever` dependency is missing. This is expected here: MCP is explicitly disabled and no additional package is installed to suppress a harmless warning. GPT Researcher's `estimatedCostUsd` is also only its static estimator; this local Ollama run made no billed provider call.

Delete `/tmp/decision-receipt-gpt-researcher` and `/tmp/decision-receipt-gpt-researcher-docs` after review. The exact adapter is [`adapters/gpt-researcher/adapter.mjs`](../../../../adapters/gpt-researcher/adapter.mjs).

## Limits

- one preloaded public excerpt, not retrieval, web research, citation discovery, or multi-source synthesis;
- one 0.6B local model, whose formatting and proposed next validation remain weak;
- no assertion that the supplied source, model inference, or receipt decision is true;
- no web search, MCP, authenticated session, second embedding model, or provider API.
