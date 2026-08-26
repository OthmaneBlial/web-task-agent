#!/usr/bin/env bash
set -euo pipefail

APP_REPO="${WEB_TASK_AGENT_REPO:-OthmaneBlial/web-task-agent}"
APP_REF="${WEB_TASK_AGENT_REF:-main}"
INSTALL_ROOT="${WEB_TASK_AGENT_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/web-task-agent}"
APP_DIR="${WEB_TASK_AGENT_APP_DIR:-${INSTALL_ROOT}/app}"
STATE_DIR="${WEB_TASK_AGENT_STATE_DIR:-${INSTALL_ROOT}/state}"
RUNTIME_DIR="${WEB_TASK_AGENT_RUNTIME_DIR:-${INSTALL_ROOT}/runtime}"
BIN_DIR="${WEB_TASK_AGENT_BIN_DIR:-${XDG_BIN_HOME:-$HOME/.local/bin}}"
LAUNCHER_NAME="${WEB_TASK_AGENT_LAUNCHER_NAME:-web-task-agent}"
NONINTERACTIVE="${WEB_TASK_AGENT_NONINTERACTIVE:-0}"
FORCE_SYSTEM_NODE="${WEB_TASK_AGENT_FORCE_SYSTEM_NODE:-0}"
SKIP_LLM_SETUP="${WEB_TASK_AGENT_SKIP_LLM_SETUP:-0}"
DEFAULT_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.z.ai/api/anthropic}"
DEFAULT_MODEL="${ANTHROPIC_MODEL:-claude-sonnet-4-20250514}"
DEFAULT_CDP_PORT="${CDP_PORT:-9222}"

usage() {
  cat <<'EOF'
Install Web Task Agent without git clone.

Usage:
  ./install.sh [options]

Options:
  --repo <owner/name>      GitHub repository to download (default: OthmaneBlial/web-task-agent)
  --ref <branch|tag>       Git reference to install (default: main)
  --root <path>            Install root that stores app, state, and runtime data
  --app-dir <path>         Code directory inside the install root
  --state-dir <path>       Persistent state directory inside the install root
  --runtime-dir <path>     Portable runtime directory inside the install root
  --bin-dir <path>         Directory for the launcher (default: ~/.local/bin)
  --launcher-name <name>   Name for the launcher command (default: web-task-agent)
  --non-interactive        Do not prompt for config values
  --skip-llm-setup         Install demos and local commands without configuring an LLM key
  --force-system-node      Require a system Node.js installation instead of bundling Node 22
  --help                   Show this help

Environment overrides:
  WEB_TASK_AGENT_REPO
  WEB_TASK_AGENT_REF
  WEB_TASK_AGENT_INSTALL_ROOT
  WEB_TASK_AGENT_APP_DIR
  WEB_TASK_AGENT_STATE_DIR
  WEB_TASK_AGENT_RUNTIME_DIR
  WEB_TASK_AGENT_BIN_DIR
  WEB_TASK_AGENT_LAUNCHER_NAME
  WEB_TASK_AGENT_NONINTERACTIVE
  WEB_TASK_AGENT_FORCE_SYSTEM_NODE
  WEB_TASK_AGENT_SKIP_LLM_SETUP
EOF
}

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

have_command() {
  command -v "$1" >/dev/null 2>&1
}

system_node_major() {
  if ! have_command node; then
    return 1
  fi
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null
}

supports_system_node() {
  local major
  if ! major="$(system_node_major)"; then
    return 1
  fi
  [[ "${major}" =~ ^[0-9]+$ ]] && (( major >= 22 ))
}

platform_triplet() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "${os}" in
    Linux)
      ;;
    Darwin)
      ;;
    *)
      die "unsupported operating system: ${os}"
      ;;
  esac

  case "${arch}" in
    x86_64|amd64)
      arch="x64"
      ;;
    arm64|aarch64)
      arch="arm64"
      ;;
    *)
      die "unsupported architecture: ${arch}"
      ;;
  esac

  printf '%s %s\n' "${os}" "${arch}"
}

resolve_node_archive_name() {
  local suffix="$1"
  local arch="$2"
  local filename

  filename="$(
    curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt \
      | awk -v os="${suffix}" -v arch="${arch}" '
          $2 ~ "^node-v22\\.[0-9]+\\.[0-9]+-" os "-" arch "\\.tar\\.xz$" { print $2; exit }
        '
  )"

  [[ -n "${filename}" ]] || die "could not resolve a Node.js 22 download for ${suffix}/${arch}"
  printf '%s\n' "${filename}"
}

ensure_node_runtime() {
  if [[ "${FORCE_SYSTEM_NODE}" == "1" ]]; then
    supports_system_node || die "Node.js 22 or newer is required. Install Node 22 or unset WEB_TASK_AGENT_FORCE_SYSTEM_NODE."
    NODE_CMD="$(command -v node)"
    NPM_CMD="$(command -v npm)"
    return 0
  fi

  if supports_system_node; then
    NODE_CMD="$(command -v node)"
    NPM_CMD="$(command -v npm)"
    return 0
  fi

  mkdir -p "${RUNTIME_DIR}"

  local os arch version tarball node_dir archive_url archive_path
  read -r os arch < <(platform_triplet)
  tarball="$(resolve_node_archive_name "${os,,}" "${arch}")"
  archive_url="https://nodejs.org/dist/latest-v22.x/${tarball}"
  archive_path="$(mktemp -t web-task-agent-node.XXXXXX.tar.xz)"
  node_dir="${RUNTIME_DIR}/node"

  log "downloading portable Node.js 22 for ${os}/${arch}..."
  curl -fsSL "${archive_url}" -o "${archive_path}"

  rm -rf "${node_dir}"
  tar -xJf "${archive_path}" -C "${RUNTIME_DIR}"
  rm -f "${archive_path}"

  local extracted_dir
  extracted_dir="${RUNTIME_DIR}/${tarball%.tar.xz}"
  if [[ -d "${extracted_dir}" ]]; then
    mv "${extracted_dir}" "${node_dir}"
  fi

  NODE_CMD="${node_dir}/bin/node"
  NPM_CMD="${node_dir}/bin/npm"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        APP_REPO="${2:-}"
        shift 2
        ;;
      --ref)
        APP_REF="${2:-}"
        shift 2
        ;;
      --root)
        INSTALL_ROOT="${2:-}"
        shift 2
        ;;
      --app-dir)
        APP_DIR="${2:-}"
        shift 2
        ;;
      --state-dir)
        STATE_DIR="${2:-}"
        shift 2
        ;;
      --runtime-dir)
        RUNTIME_DIR="${2:-}"
        shift 2
        ;;
      --bin-dir)
        BIN_DIR="${2:-}"
        shift 2
        ;;
      --launcher-name)
        LAUNCHER_NAME="${2:-}"
        shift 2
        ;;
      --non-interactive)
        NONINTERACTIVE=1
        shift
        ;;
      --force-system-node)
        FORCE_SYSTEM_NODE=1
        shift
        ;;
      --skip-llm-setup)
        SKIP_LLM_SETUP=1
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        die "unknown option: $1"
        ;;
    esac
  done
}

prompt_value() {
  local label="$1"
  local default="$2"
  local secret="${3:-0}"
  local value=""

  if [[ "${NONINTERACTIVE}" == "1" ]]; then
    printf '%s\n' "${default}"
    return 0
  fi

  if [[ "${secret}" == "1" ]]; then
    read -r -s -p "${label} [${default}]: " value || true
    printf '\n'
  else
    read -r -p "${label} [${default}]: " value || true
  fi

  value="${value:-${default}}"
  printf '%s\n' "${value}"
}

ensure_launcher_dir() {
  mkdir -p "${BIN_DIR}"
}

write_launcher() {
  local launcher_path="$1"
  cat >"${launcher_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR}"
STATE_DIR="${STATE_DIR}"
RUNTIME_DIR="${RUNTIME_DIR}"

if [[ -x "\${RUNTIME_DIR}/node/bin/node" ]]; then
  NODE_BIN="\${RUNTIME_DIR}/node/bin/node"
else
  NODE_BIN="\$(command -v node)"
fi

cd "\${APP_DIR}"
exec "\${NODE_BIN}" dist/cli.js "\$@"
EOF
  chmod +x "${launcher_path}"
}

install_symlinks() {
  mkdir -p "${STATE_DIR}/cache" "${STATE_DIR}/data" "${STATE_DIR}/reports" "${RUNTIME_DIR}"

  ln -sfn "${STATE_DIR}/cache" "${APP_DIR}/.cache"
  ln -sfn "${STATE_DIR}/data" "${APP_DIR}/.data"
  ln -sfn "${STATE_DIR}/reports" "${APP_DIR}/reports"
}

prompt_for_env_file() {
  local env_path="$1"
  local api_key base_url model cdp_port

  if [[ -f "${env_path}" ]]; then
    return 0
  fi

  api_key="${ANTHROPIC_API_KEY:-}"
  if [[ -z "${api_key}" && "${SKIP_LLM_SETUP}" == "1" ]]; then
    api_key=""
  elif [[ -z "${api_key}" && "${NONINTERACTIVE}" == "0" ]]; then
    while [[ -z "${api_key}" ]]; do
      api_key="$(prompt_value "Anthropic API key" "" 1)"
      [[ -n "${api_key}" ]] || printf 'Anthropic API key is required.\n' >&2
    done
  fi

  if [[ -z "${api_key}" && "${NONINTERACTIVE}" == "1" && "${SKIP_LLM_SETUP}" != "1" ]]; then
    die "ANTHROPIC_API_KEY is required. Re-run with ANTHROPIC_API_KEY set or use interactive mode."
  fi

  if [[ "${SKIP_LLM_SETUP}" == "1" ]]; then
    base_url="${DEFAULT_BASE_URL}"
    model="${DEFAULT_MODEL}"
    cdp_port="${DEFAULT_CDP_PORT}"
  else
    base_url="$(prompt_value "Anthropic base URL" "${DEFAULT_BASE_URL}")"
    model="$(prompt_value "Anthropic model" "${DEFAULT_MODEL}")"
    cdp_port="$(prompt_value "CDP port" "${DEFAULT_CDP_PORT}")"
  fi

  cat >"${env_path}" <<EOF
CDP_PORT=${cdp_port}
LIGHTPANDA_DISABLE_TELEMETRY=true
ANTHROPIC_API_KEY=${api_key}
ANTHROPIC_BASE_URL=${base_url}
ANTHROPIC_MODEL=${model}
ANTHROPIC_TIMEOUT_MS=90000
WEB_TASK_AGENT_DB_PATH=.data/web-task-agent.sqlite
EOF
}

download_source_archive() {
  local archive_path="$1"
  local archive_url="https://codeload.github.com/${APP_REPO}/tar.gz/${APP_REF}"

  log "downloading ${APP_REPO}@${APP_REF}..."
  curl -fsSL "${archive_url}" -o "${archive_path}"
}

install_app() {
  local archive_path stage_dir env_backup
  stage_dir="$(mktemp -d -t web-task-agent-install.XXXXXX)"
  archive_path="$(mktemp -t web-task-agent-source.XXXXXX.tar.gz)"

  download_source_archive "${archive_path}"

  mkdir -p "${stage_dir}"
  tar -xzf "${archive_path}" -C "${stage_dir}" --strip-components=1
  rm -f "${archive_path}"

  if [[ -f "${APP_DIR}/.env" ]]; then
    env_backup="$(mktemp -t web-task-agent-env.XXXXXX)"
    cp "${APP_DIR}/.env" "${env_backup}"
  else
    env_backup=""
  fi

  rm -rf "${APP_DIR}"
  mkdir -p "${APP_DIR}"
  cp -R "${stage_dir}/." "${APP_DIR}/"
  rm -rf "${stage_dir}"

  if [[ -n "${env_backup}" && -f "${env_backup}" ]]; then
    cp "${env_backup}" "${APP_DIR}/.env"
    rm -f "${env_backup}"
  fi
}

run_npm_install() {
  log "installing dependencies..."
  "${NPM_CMD}" ci --prefix "${APP_DIR}"
  log "building the app..."
  "${NPM_CMD}" run build --prefix "${APP_DIR}"
}

main() {
  parse_args "$@"

  if [[ ! -d "$(dirname "${APP_DIR}")" ]]; then
    mkdir -p "$(dirname "${APP_DIR}")"
  fi
  mkdir -p "${INSTALL_ROOT}"

  ensure_node_runtime
  install_app
  prompt_for_env_file "${APP_DIR}/.env"
  install_symlinks
  run_npm_install
  ensure_launcher_dir
  write_launcher "${BIN_DIR}/${LAUNCHER_NAME}"

  log "installed Web Task Agent to ${APP_DIR}"
  log "launcher: ${BIN_DIR}/${LAUNCHER_NAME}"
  log "state: ${STATE_DIR}"
  log "runtime: ${RUNTIME_DIR}"
  if [[ "${SKIP_LLM_SETUP}" == "1" ]]; then
    log "next: run ${LAUNCHER_NAME} demo list, then configure ANTHROPIC_API_KEY in ${APP_DIR}/.env for live research"
  else
    log "next: run ${LAUNCHER_NAME} demo list or ${LAUNCHER_NAME} workflow list"
  fi
}

main "$@"
