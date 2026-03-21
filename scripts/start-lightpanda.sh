#!/usr/bin/env bash
set -euo pipefail

PORT="${CDP_PORT:-${CHROME_PORT:-9222}}"
LIGHTPANDA_DIR="${LIGHTPANDA_DIR:-$HOME/.cache/web-task-agent/lightpanda}"
LIGHTPANDA_BIN="${LIGHTPANDA_DIR}/lightpanda"
LOG_LEVEL="${LIGHTPANDA_LOG_LEVEL:-info}"
LOG_FILE="${LIGHTPANDA_LOG_FILE:-/tmp/web-task-agent-lightpanda.log}"
PID_FILE="${LIGHTPANDA_DIR}/lightpanda.pid"
DISABLE_TELEMETRY="${LIGHTPANDA_DISABLE_TELEMETRY:-true}"

ACTION="${1:-start}"

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "${os}" in
    Linux)
      case "${arch}" in
        x86_64)  echo "lightpanda-x86_64-linux" ;;
        *)       echo "unsupported arch: ${arch}" >&2; exit 1 ;;
      esac
      ;;
    Darwin)
      case "${arch}" in
        arm64|aarch64) echo "lightpanda-aarch64-macos" ;;
        *)             echo "unsupported arch: ${arch}" >&2; exit 1 ;;
      esac
      ;;
    *)
      echo "unsupported OS: ${os}" >&2
      exit 1
      ;;
  esac
}

download_binary() {
  local binary_name
  binary_name="$(detect_platform)"

  mkdir -p "${LIGHTPANDA_DIR}"

  echo "downloading lightpanda nightly binary..."
  curl -L -o "${LIGHTPANDA_BIN}" \
    "https://github.com/lightpanda-io/browser/releases/download/nightly/${binary_name}"
  chmod a+x "${LIGHTPANDA_BIN}"
  echo "lightpanda binary installed at ${LIGHTPANDA_BIN}"
}

is_running() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}")"
    if kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
    rm -f "${PID_FILE}"
  fi
  return 1
}

# Check if something is listening on the port and whether it's Lightpanda or something else.
check_port_owner() {
  if ! curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    echo "free"
    return
  fi

  local browser_name
  browser_name="$(curl -sf "http://127.0.0.1:${PORT}/json/version" 2>/dev/null | grep -o '"Browser"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 || echo "")"

  if echo "${browser_name}" | grep -qi "lightpanda"; then
    echo "lightpanda"
  elif echo "${browser_name}" | grep -qi "chrome\|chromium"; then
    echo "chrome"
  else
    echo "unknown"
  fi
}

kill_port_occupant() {
  # Try to find and kill whatever is using the port.
  local pids
  pids="$(lsof -ti :"${PORT}" 2>/dev/null || fuser "${PORT}/tcp" 2>/dev/null | tr -s ' ' '\n' || echo "")"

  if [[ -n "${pids}" ]]; then
    echo "killing process(es) on port ${PORT}: ${pids}"
    echo "${pids}" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

case "${ACTION}" in
  start)
    local_owner="$(check_port_owner)"

    if [[ "${local_owner}" == "lightpanda" ]]; then
      echo "lightpanda CDP server already running on port ${PORT}"
      exit 0
    fi

    if [[ "${local_owner}" == "chrome" || "${local_owner}" == "unknown" ]]; then
      echo "port ${PORT} occupied by ${local_owner} — killing it to start lightpanda..."
      kill_port_occupant
    fi

    # Download binary if not present.
    if [[ ! -x "${LIGHTPANDA_BIN}" ]]; then
      download_binary
    fi

    # Kill any stale lightpanda process.
    if is_running; then
      kill "$(cat "${PID_FILE}")" 2>/dev/null || true
      rm -f "${PID_FILE}"
      sleep 0.5
    fi

    echo "starting lightpanda CDP server on port ${PORT}..."

    export LIGHTPANDA_DISABLE_TELEMETRY="${DISABLE_TELEMETRY}"

    nohup "${LIGHTPANDA_BIN}" serve \
      --host 127.0.0.1 \
      --port "${PORT}" \
      --log_level "${LOG_LEVEL}" \
      >"${LOG_FILE}" 2>&1 &

    echo $! > "${PID_FILE}"

    # Wait for the CDP endpoint to become available.
    for _ in $(seq 1 40); do
      if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
        echo "lightpanda CDP server ready on port ${PORT}"
        echo "pid: $(cat "${PID_FILE}")"
        echo "log: ${LOG_FILE}"
        exit 0
      fi
      sleep 0.25
    done

    echo "lightpanda started but CDP endpoint is not ready after 10s"
    echo "check logs: ${LOG_FILE}"
    exit 1
    ;;

  stop)
    if is_running; then
      kill "$(cat "${PID_FILE}")" 2>/dev/null || true
      rm -f "${PID_FILE}"
      echo "lightpanda stopped"
    else
      echo "no running lightpanda process found"
    fi
    exit 0
    ;;

  status)
    if curl -sf "http://127.0.0.1:${PORT}/json/version" 2>/dev/null; then
      echo ""
      local_owner="$(check_port_owner)"
      echo "CDP server on port ${PORT} is: ${local_owner}"
    else
      echo "CDP server is not reachable on port ${PORT}"
      exit 1
    fi
    ;;

  update)
    if is_running; then
      echo "stopping lightpanda before update..."
      kill "$(cat "${PID_FILE}")" 2>/dev/null || true
      rm -f "${PID_FILE}"
      sleep 0.5
    fi
    rm -f "${LIGHTPANDA_BIN}"
    download_binary
    echo "lightpanda updated. run '$0 start' to start."
    ;;

  --help|-h)
    cat <<'EOF'
Usage: ./scripts/start-lightpanda.sh [start|stop|restart|status|update]

Commands:
  start   Download (if needed) and start the Lightpanda CDP server (default)
          Automatically kills Chrome/other browsers if they occupy the port.
  stop    Stop the Lightpanda process
  restart Stop and start the Lightpanda process
  status  Check if the CDP server is reachable and what browser is running
  update  Re-download the latest nightly binary

Environment:
  CDP_PORT=9222                          CDP server port (default 9222)
  LIGHTPANDA_DIR=~/.cache/…/lightpanda   Binary install directory
  LIGHTPANDA_LOG_LEVEL=info              Log level (debug, info, warn, error)
  LIGHTPANDA_LOG_FILE=/tmp/…             Log output file
  LIGHTPANDA_DISABLE_TELEMETRY=true      Disable telemetry (default true)
EOF
    exit 0
    ;;

  restart)
    "$0" stop
    "$0" start
    ;;

  *)
    echo "unknown action: ${ACTION}" >&2
    echo "usage: $0 [start|stop|restart|status|update|--help]" >&2
    exit 1
    ;;
esac
