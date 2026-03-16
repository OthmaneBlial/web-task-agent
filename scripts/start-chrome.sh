#!/usr/bin/env bash
set -euo pipefail

PORT="${CHROME_PORT:-9222}"
PROFILE_DIR="${CHROME_PROFILE_DIR:-$HOME/.cache/web-task-agent/chrome-profile}"
START_URL="${CHROME_START_URL:-https://github.com/}"
LOG_FILE="${CHROME_LOG_FILE:-/tmp/web-task-agent-chrome.log}"
WINDOW_SIZE="${CHROME_WINDOW_SIZE:-1440,900}"
HEADLESS_INPUT="${CHROME_HEADLESS:-0}"
HEADLESS_MODE="0"

for arg in "$@"; do
  case "${arg}" in
    --headless)
      HEADLESS_INPUT="1"
      ;;
    --visible|--headed)
      HEADLESS_INPUT="0"
      ;;
    --help|-h)
      cat <<'EOF'
Usage: ./scripts/start-chrome.sh [--headless|--visible]

Options:
  --headless  Start Chrome with a headless remote-debugging session.
  --visible   Start Chrome with a visible window.

Environment:
  CHROME_HEADLESS=1        Same as --headless
  CHROME_WINDOW_SIZE=WxH   Window size for headless mode, default 1440,900
EOF
      exit 0
      ;;
    *)
      echo "unknown argument: ${arg}" >&2
      exit 1
      ;;
  esac
done

case "${HEADLESS_INPUT,,}" in
  1|true|yes|on)
    HEADLESS_MODE="1"
    ;;
  0|false|no|off|"")
    HEADLESS_MODE="0"
    ;;
  *)
    echo "invalid CHROME_HEADLESS value: ${HEADLESS_INPUT}" >&2
    exit 1
    ;;
esac

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

CHROME_ARGS=(
  --remote-debugging-port="${PORT}"
  --user-data-dir="${PROFILE_DIR}"
  --no-default-browser-check
  --no-first-run
)

if [[ "${HEADLESS_MODE}" == "1" ]]; then
  CHROME_ARGS+=(
    --headless=new
    --disable-gpu
    --window-size="${WINDOW_SIZE}"
  )
else
  CHROME_ARGS+=(
    --new-window
  )
fi

CHROME_ARGS+=("${START_URL}")

nohup "${CHROME_BIN}" "${CHROME_ARGS[@]}" >"${LOG_FILE}" 2>&1 &

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    if [[ "${HEADLESS_MODE}" == "1" ]]; then
      echo "chrome debugger started in headless mode on port ${PORT}"
      echo "window size: ${WINDOW_SIZE}"
    else
      echo "chrome debugger started in visible mode on port ${PORT}"
    fi
    echo "profile dir: ${PROFILE_DIR}"
    exit 0
  fi
  sleep 0.25
done

echo "chrome launched but debugger endpoint is not ready yet"
echo "check logs: ${LOG_FILE}"
exit 1
