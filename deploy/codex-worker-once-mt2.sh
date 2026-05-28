#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/sato/ox-ai-workshop-builder"
DATA_DIR="${APP_DIR}/data"
REQUEST_DIR="${DATA_DIR}/codex-requests"
RESULT_DIR="${DATA_DIR}/codex-results"
LOG_DIR="${DATA_DIR}/codex-logs"
RUN_DIR="${DATA_DIR}/codex-runs"
CODEX_SOURCE_HOME="/home/sato/.codex"
LOCK_FILE="${RUN_DIR}/codex-worker.lock"

if [[ "${EUID}" -eq 0 ]]; then
  exec sudo -u sato env HOME=/home/sato OX_CODEX_WORKER_TIMEOUT_SECONDS="${OX_CODEX_WORKER_TIMEOUT_SECONDS:-180}" "$0" "$@"
fi

mkdir -p "${REQUEST_DIR}" "${RESULT_DIR}" "${LOG_DIR}" "${RUN_DIR}"

json_escape() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/}"
  printf '%s' "${value}"
}

write_result() {
  local result_file="$1"
  local ok="$2"
  local code="$3"
  local message="$4"
  cat > "${result_file}.tmp" <<EOF
{
  "ok": ${ok},
  "exitCode": ${code},
  "message": "$(json_escape "${message}")",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
  mv "${result_file}.tmp" "${result_file}"
}

append_log() {
  local log_file="$1"
  local line="$2"
  printf '[%s] codex: %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")" "${line}" >> "${log_file}"
}

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

shopt -s nullglob
requests=("${REQUEST_DIR}"/*.json)
if [[ "${#requests[@]}" -eq 0 ]]; then
  exit 0
fi

request="${requests[0]}"
project_id="$(basename "${request}" .json)"
if [[ ! "${project_id}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  rm -f "${request}"
  exit 0
fi

app_dir="${DATA_DIR}/generated/${project_id}"
prompt_file="${app_dir}/prompt.md"
result_file="${RESULT_DIR}/${project_id}.json"
log_file="${LOG_DIR}/${project_id}.log"
codex_home="${RUN_DIR}/${project_id}-codex-home"

rm -rf "${codex_home}"
mkdir -p "${codex_home}"/{memories,sessions,log,tmp}
if [[ -f "${CODEX_SOURCE_HOME}/auth.json" ]]; then
  cp "${CODEX_SOURCE_HOME}/auth.json" "${codex_home}/auth.json"
fi
if [[ -f "${CODEX_SOURCE_HOME}/config.toml" ]]; then
  cp "${CODEX_SOURCE_HOME}/config.toml" "${codex_home}/config.toml"
fi
if [[ -f "${CODEX_SOURCE_HOME}/installation_id" ]]; then
  cp "${CODEX_SOURCE_HOME}/installation_id" "${codex_home}/installation_id"
fi
chmod -R go-rwx "${codex_home}" || true

mv "${request}" "${request}.running"
append_log "${log_file}" '{"type":"item.completed","item":{"type":"agent_message","text":"AI開発ワーカーが作業を開始しました。入力、処理、出力の流れを確認します。"}}'

if [[ ! -d "${app_dir}" || ! -f "${prompt_file}" ]]; then
  append_log "${log_file}" '{"type":"item.completed","item":{"type":"agent_message","text":"生成対象のアプリファイルが見つからないため、現在の生成結果を表示します。"}}'
  write_result "${result_file}" "false" "2" "generated app files were not found"
  rm -f "${request}.running"
  rm -rf "${codex_home}"
  exit 0
fi

if ! command -v codex >/dev/null 2>&1; then
  append_log "${log_file}" '{"type":"item.completed","item":{"type":"agent_message","text":"mt2ホストに開発AIコマンドが見つかりません。ローカル生成結果を表示します。"}}'
  write_result "${result_file}" "false" "127" "codex command was not found on mt2 host"
  rm -f "${request}.running"
  rm -rf "${codex_home}"
  exit 0
fi

set +e
timeout "${OX_CODEX_WORKER_TIMEOUT_SECONDS:-180}s" env \
  HOME=/home/sato \
  CODEX_HOME="${codex_home}" \
  codex exec \
    --sandbox workspace-write \
    --skip-git-repo-check \
    --json \
    --output-last-message "${app_dir}/codex-summary.md" \
    - \
  < "${prompt_file}" \
  > >(while IFS= read -r line; do append_log "${log_file}" "${line}"; done) \
  2> >(while IFS= read -r line; do append_log "${log_file}" "${line}"; done)
status=$?
set -e

if [[ "${status}" -eq 0 ]]; then
  append_log "${log_file}" '{"type":"item.completed","item":{"type":"agent_message","text":"解析エンジンとUIの更新が完了しました。完成画面へ反映します。"}}'
  write_result "${result_file}" "true" "0" "codex completed"
else
  append_log "${log_file}" '{"type":"item.completed","item":{"type":"agent_message","text":"AIの作業中に問題がありました。現在の生成結果を表示します。"}}'
  write_result "${result_file}" "false" "${status}" "codex failed"
fi

rm -f "${request}.running"
rm -rf "${codex_home}"
