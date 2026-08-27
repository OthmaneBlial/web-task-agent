# Authentic Browser Use run

This directory contains a real, bounded Browser Use `0.13.8` execution from 2026-08-27. Browser Use launched local headless Chrome, allowed only `example.com`, and captured the page through its DOM-to-Markdown extractor. A local Ollama `qwen3:0.6b-q4_K_M` model (523 MB) produced the three-field structured projection. It is not a synthetic fixture.

The checked-in `engine-output.json` is the privacy-safe engine projection, not a full browser history. It contains no cookie, session, screenshot, prompt trace, raw network trace, credential, or private URL. The source is the redistributable [Example Domain](https://example.com/) page.

## Reproduce

```bash
python3.12 -m venv /tmp/decision-receipt-browser-use
/tmp/decision-receipt-browser-use/bin/pip install \
  -r scripts/interop/browser-use-requirements.txt
ollama pull qwen3:0.6b-q4_K_M

ANONYMIZED_TELEMETRY=false \
BROWSER_USE_CLOUD_SYNC=false \
BROWSER_USE_VERSION_CHECK=false \
BROWSER_USE_DISABLE_EXTENSIONS=1 \
BROWSER_USE_CONFIG_DIR=/tmp/decision-receipt-browser-use-config \
/tmp/decision-receipt-browser-use/bin/python \
  scripts/interop/run-browser-use.py
```

The capture time and run ID change on every execution. Review the JSON before replacing the checked-in output. The exact adapter is [`adapters/browser-use/adapter.mjs`](../../../../adapters/browser-use/adapter.mjs); the generated adapter result and receipt are validated by the repository tests.

## Limits

- one intentionally simple public page, not a broad browsing benchmark;
- one 0.6B local model and one prompt-free adapter mapping;
- no assertion that the page, model summary, or receipt decision is true;
- no authenticated flow, interaction, screenshot, or multi-source contradiction.
