#!/usr/bin/env bash
set -euo pipefail

PORT="${CHROME_PORT:-9222}"
PROFILE_DIR="${CHROME_PROFILE_DIR:-$HOME/.cache/web-task-agent/chrome-profile}"
START_URL="${CHROME_START_URL:-https://github.com/}"
LOG_FILE="${CHROME_LOG_FILE:-/tmp/web-task-agent-chrome.log}"

if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "chrome debugger already running on port ${PORT}"
  exit 0
fi

CHROME_BIN=""
for candidate in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    CHROME_BIN="${candidate}"
    break
  fi
done

if [[ -z "${CHROME_BIN}" ]]; then
  echo "could not find chrome/chromium binary"
  exit 1
fi

mkdir -p "${PROFILE_DIR}"

nohup "${CHROME_BIN}" \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-default-browser-check \
  --no-first-run \
  --new-window "${START_URL}" \
  >"${LOG_FILE}" 2>&1 &

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    echo "chrome debugger started on port ${PORT}"
    echo "profile dir: ${PROFILE_DIR}"
    exit 0
  fi
  sleep 0.25
done

echo "chrome launched but debugger endpoint is not ready yet"
echo "check logs: ${LOG_FILE}"
exit 1
