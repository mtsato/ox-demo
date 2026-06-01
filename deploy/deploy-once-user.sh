#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${OX_APP_DIR:-/home/sato/ox-ai-workshop-builder}"
DATA_DIR="${APP_DIR}/data"
REQUEST_DIR="${DATA_DIR}/deploy-requests"
PROCESSED_DIR="${DATA_DIR}/deploy-processed"
LOG_DIR="${DATA_DIR}/deploy-logs"
STATUS_FILE="${DATA_DIR}/deploy-status.json"
LOCK_FILE="${DATA_DIR}/deploy.lock"
RESET_CMD="${OX_RESET_CMD:-${APP_DIR}/deploy/reset-user-single-instance.sh}"
REMOTE="${OX_DEPLOY_REMOTE:-origin}"
request_count=0
before=""
after=""

mkdir -p "${REQUEST_DIR}" "${PROCESSED_DIR}" "${LOG_DIR}" "${DATA_DIR}"

json_escape() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/}"
  printf '%s' "${value}"
}

write_status() {
  local state="$1"
  local message="$2"
  local before_ref="${3:-}"
  local after_ref="${4:-}"
  local count="${5:-0}"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  cat > "${STATUS_FILE}.tmp" <<EOF
{
  "state": "$(json_escape "${state}")",
  "message": "$(json_escape "${message}")",
  "updatedAt": "${ts}",
  "before": "$(json_escape "${before_ref}")",
  "after": "$(json_escape "${after_ref}")",
  "requestCount": ${count}
}
EOF
  mv "${STATUS_FILE}.tmp" "${STATUS_FILE}"
}

mark_error() {
  local code="$?"
  if [[ "${code}" -ne 0 ]]; then
    write_status "error" "デプロイに失敗しました。11.81 の deploy log を確認してください。" "${before}" "${after}" "${request_count}"
  fi
}
trap mark_error ERR

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

shopt -s nullglob
requests=("${REQUEST_DIR}"/*.json)
if [[ "${#requests[@]}" -eq 0 ]]; then
  exit 0
fi
request_count="${#requests[@]}"

run_id="$(date -u +"%Y%m%dT%H%M%SZ")"
run_dir="${PROCESSED_DIR}/${run_id}"
log_file="${LOG_DIR}/${run_id}.log"
mkdir -p "${run_dir}"

for request in "${requests[@]}"; do
  mv "${request}" "${run_dir}/$(basename "${request}")"
done

exec > >(tee -a "${log_file}") 2>&1
echo "deploy started: ${run_id}"
write_status "running" "GitHubから最新版を取得しています。" "" "" "${request_count}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  write_status "error" "${APP_DIR} はGitリポジトリではありません。" "" "" "${request_count}"
  exit 0
fi

cd "${APP_DIR}"
branch="${OX_DEPLOY_BRANCH:-}"
if [[ -z "${branch}" ]]; then
  branch="$(git -C "${APP_DIR}" symbolic-ref --short HEAD 2>/dev/null || true)"
fi
if [[ -z "${branch}" ]]; then
  branch="main"
fi

before="$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || true)"
git -C "${APP_DIR}" fetch "${REMOTE}" "${branch}"
git -C "${APP_DIR}" pull --ff-only "${REMOTE}" "${branch}"
after="$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || true)"

write_status "running" "最新版を取得しました。アプリを再起動しています。" "${before}" "${after}" "${request_count}"
"${RESET_CMD}"

write_status "success" "デプロイが完了しました。" "${before}" "${after}" "${request_count}"
echo "deploy completed: ${before} -> ${after}"
