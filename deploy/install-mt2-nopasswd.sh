#!/usr/bin/env bash
set -euo pipefail

SOURCE="/home/sato/ox-ai-workshop-builder/deploy/reset-mt2-single-instance.sh"
TARGET="/usr/local/sbin/ox-ai-workshop-reset"
STATUS_SOURCE="/home/sato/ox-ai-workshop-builder/deploy/status-mt2-single-instance.sh"
STATUS_TARGET="/usr/local/sbin/ox-ai-workshop-status"
DEPLOY_SOURCE="/home/sato/ox-ai-workshop-builder/deploy/deploy-once-mt2.sh"
DEPLOY_TARGET="/usr/local/sbin/ox-ai-workshop-deploy-once"
CODEX_WORKER_SOURCE="/home/sato/ox-ai-workshop-builder/deploy/codex-worker-once-mt2.sh"
CODEX_WORKER_TARGET="/usr/local/sbin/ox-ai-workshop-codex-worker-once"
INSTALL_SOURCE="/home/sato/ox-ai-workshop-builder/deploy/install-mt2-nopasswd.sh"
INSTALL_TARGET="/usr/local/sbin/ox-ai-workshop-install"
SUDOERS="/etc/sudoers.d/ox-ai-workshop-builder"
APP_DIR="/home/sato/ox-ai-workshop-builder"
DEPLOY_ENV="${APP_DIR}/.deploy.env"
SERVICE_FILE="/etc/systemd/system/ox-ai-workshop-deploy.service"
TIMER_FILE="/etc/systemd/system/ox-ai-workshop-deploy.timer"
CODEX_SERVICE_FILE="/etc/systemd/system/ox-ai-workshop-codex-worker.service"
CODEX_TIMER_FILE="/etc/systemd/system/ox-ai-workshop-codex-worker.timer"

if [[ "${EUID}" -ne 0 ]]; then
  echo "sudo ${0}"
  exit 1
fi

install -o root -g root -m 0755 "${SOURCE}" "${TARGET}"
install -o root -g root -m 0755 "${STATUS_SOURCE}" "${STATUS_TARGET}"
install -o root -g root -m 0755 "${DEPLOY_SOURCE}" "${DEPLOY_TARGET}"
install -o root -g root -m 0755 "${CODEX_WORKER_SOURCE}" "${CODEX_WORKER_TARGET}"
install -o root -g root -m 0755 "${INSTALL_SOURCE}" "${INSTALL_TARGET}"

if [[ ! -f "${DEPLOY_ENV}" ]]; then
  umask 077
  printf 'OX_DEPLOY_TOKEN=%s\n' "$(openssl rand -hex 32)" > "${DEPLOY_ENV}"
  chown sato:sato "${DEPLOY_ENV}"
fi
chmod 0600 "${DEPLOY_ENV}"

mkdir -p \
  "${APP_DIR}/data/deploy-requests" \
  "${APP_DIR}/data/deploy-processed" \
  "${APP_DIR}/data/deploy-logs" \
  "${APP_DIR}/data/codex-requests" \
  "${APP_DIR}/data/codex-results" \
  "${APP_DIR}/data/codex-logs" \
  "${APP_DIR}/data/codex-runs"
chown -R sato:sato "${APP_DIR}/data"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=OX AI Workshop Builder deploy request worker

[Service]
Type=oneshot
ExecStart=${DEPLOY_TARGET}
EOF

cat > "${TIMER_FILE}" <<EOF
[Unit]
Description=Poll OX AI Workshop Builder deploy requests

[Timer]
OnBootSec=30s
OnUnitActiveSec=10s
AccuracySec=1s
Unit=ox-ai-workshop-deploy.service

[Install]
WantedBy=timers.target
EOF

cat > "${CODEX_SERVICE_FILE}" <<EOF
[Unit]
Description=OX AI Workshop Builder Codex worker

[Service]
Type=oneshot
ExecStart=${CODEX_WORKER_TARGET}
EOF

cat > "${CODEX_TIMER_FILE}" <<EOF
[Unit]
Description=Poll OX AI Workshop Builder Codex jobs

[Timer]
OnBootSec=20s
OnUnitActiveSec=3s
AccuracySec=1s
Unit=ox-ai-workshop-codex-worker.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now ox-ai-workshop-deploy.timer >/dev/null
systemctl enable --now ox-ai-workshop-codex-worker.timer >/dev/null

{
  printf '%s\n' 'sato ALL=(root) NOPASSWD: /usr/local/sbin/ox-ai-workshop-install'
  printf '%s\n' 'sato ALL=(root) NOPASSWD: /usr/local/sbin/ox-ai-workshop-reset'
  printf '%s\n' 'sato ALL=(root) NOPASSWD: /usr/local/sbin/ox-ai-workshop-status'
  printf '%s\n' 'sato ALL=(root) NOPASSWD: /usr/local/sbin/ox-ai-workshop-deploy-once'
  printf '%s\n' 'sato ALL=(root) NOPASSWD: /usr/local/sbin/ox-ai-workshop-codex-worker-once'
} > "${SUDOERS}"
chmod 0440 "${SUDOERS}"
visudo -cf "${SUDOERS}"

echo "Installed: ${INSTALL_TARGET}"
echo "Installed: ${TARGET}"
echo "Installed: ${STATUS_TARGET}"
echo "Installed: ${DEPLOY_TARGET}"
echo "Installed: ${CODEX_WORKER_TARGET}"
echo "Installed timer: ox-ai-workshop-deploy.timer"
echo "Installed timer: ox-ai-workshop-codex-worker.timer"
echo "Deploy token file: ${DEPLOY_ENV}"
echo "NOPASSWD: sudo -n ${INSTALL_TARGET}"
echo "NOPASSWD: sudo -n ${TARGET}"
echo "NOPASSWD: sudo -n ${STATUS_TARGET}"
echo "NOPASSWD: sudo -n ${DEPLOY_TARGET}"
echo "NOPASSWD: sudo -n ${CODEX_WORKER_TARGET}"
