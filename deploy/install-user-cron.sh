#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${OX_APP_DIR:-/home/sato/ox-ai-workshop-builder}"
DATA_DIR="${APP_DIR}/data"
DEPLOY_CMD="${APP_DIR}/deploy/deploy-once-user.sh"
CODEX_CMD="${APP_DIR}/deploy/codex-worker-once-mt2.sh"
CRON_MARK="ox-ai-workshop-builder"
CRON_FILE="$(mktemp)"

mkdir -p "${DATA_DIR}/deploy-logs" "${DATA_DIR}/codex-logs"

if [[ "${OX_INSTALL_CODEX_CLI:-1}" == "1" ]] && ! command -v codex >/dev/null 2>&1; then
  mkdir -p "${HOME}/.local"
  npm install -g @openai/codex@latest --prefix "${HOME}/.local"
fi

crontab -l 2>/dev/null | grep -v "${CRON_MARK}" > "${CRON_FILE}" || true
cat >> "${CRON_FILE}" <<EOF
* * * * PATH=${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin OX_APP_DIR=${APP_DIR} ${DEPLOY_CMD} >> ${DATA_DIR}/deploy-logs/cron.log 2>&1 # ${CRON_MARK}-deploy
* * * * PATH=${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin OX_APP_DIR=${APP_DIR} ${CODEX_CMD} >> ${DATA_DIR}/codex-logs/cron.log 2>&1 # ${CRON_MARK}-codex
EOF
crontab "${CRON_FILE}"
rm -f "${CRON_FILE}"

echo "Installed user cron for OX AI Workshop Builder"
crontab -l | grep "${CRON_MARK}" || true
