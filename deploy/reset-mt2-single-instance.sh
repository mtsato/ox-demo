#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/sato/ox-ai-workshop-builder"
DATA_DIR="${APP_DIR}/data"
ENV_FILE="${APP_DIR}/.deploy.env"
CLOUDFLARED_DIR="/home/sato/.cloudflared"
NETWORK="ox-ai-net"
IMAGE="ox-ai-workshop-builder:local"
APP_CONTAINER="ox-ai-workshop-builder"
TUNNEL_CONTAINER="ox-ai-workshop-tunnel"
TUNNEL_NAME="ox-ai-workshop-demo"
TUNNEL_ID="7dfdff13-6e1d-49e3-ae50-f3502da13886"
HOSTNAME="demo.ox-ai-app.com"

if [[ "${EUID}" -ne 0 ]]; then
  echo "sudo bash ${0}"
  exit 1
fi

cd "${APP_DIR}"
mkdir -p /home/sato/.codex
chown -R sato:sato /home/sato/.codex
docker build --build-arg INSTALL_CODEX=1 -t "${IMAGE}" .

remove_container() {
  local name="$1"
  if ! docker container inspect "${name}" >/dev/null 2>&1; then
    return 0
  fi

  echo "Removing container: ${name}"
  docker update --restart=no "${name}" >/dev/null 2>&1 || true
  docker unpause "${name}" >/dev/null 2>&1 || true

  local pid
  pid="$(docker inspect "${name}" --format '{{.State.Pid}}' 2>/dev/null || true)"
  if [[ "${pid}" =~ ^[0-9]+$ ]] && [[ "${pid}" -gt 1 ]]; then
    kill -TERM "${pid}" 2>/dev/null || true
    sleep 1
    kill -KILL "${pid}" 2>/dev/null || true
  fi

  docker stop -t 1 "${name}" >/dev/null 2>&1 || true

  if ! docker rm -f "${name}"; then
    pid="$(docker inspect "${name}" --format '{{.State.Pid}}' 2>/dev/null || true)"
    if [[ "${pid}" =~ ^[0-9]+$ ]] && [[ "${pid}" -gt 1 ]]; then
      echo "Docker could not kill ${name}; trying direct PID stop: ${pid}"
      kill -TERM "${pid}" 2>/dev/null || true
      sleep 2
      kill -KILL "${pid}" 2>/dev/null || true
      sleep 1
    fi

    if ! docker rm -f "${name}"; then
      echo "ERROR: failed to remove ${name}" >&2
      echo "Current state:" >&2
      docker inspect "${name}" --format 'name={{.Name}} id={{.Id}} state={{.State.Status}} pid={{.State.Pid}} image={{.Config.Image}} restart={{.HostConfig.RestartPolicy.Name}}' >&2 || true
      echo "Stop here to avoid creating duplicate containers." >&2
      exit 1
    fi
  fi
}

mapfile -t OLD_WORKSHOP_CONTAINERS < <(docker ps -a --format '{{.Names}}' | grep -E '^ox-ai-workshop-(builder|tunnel)-old-' || true)

for name in \
  ox-ai-workshop-builder-v4 \
  ox-ai-workshop-builder-v3 \
  ox-ai-workshop-builder-v2 \
  ox-ai-workshop-builder \
  ox-ai-workshop-tunnel-v4 \
  ox-ai-workshop-tunnel-v3 \
  ox-ai-workshop-tunnel-v2 \
  ox-ai-workshop-tunnel \
  "${OLD_WORKSHOP_CONTAINERS[@]}"; do
  [[ -n "${name}" ]] || continue
  remove_container "${name}"
done

docker network inspect "${NETWORK}" >/dev/null 2>&1 || docker network create "${NETWORK}"
mkdir -p "${DATA_DIR}"
chown -R sato:sato "${DATA_DIR}"

ENV_ARGS=()
if [[ -f "${ENV_FILE}" ]]; then
  ENV_ARGS+=(--env-file "${ENV_FILE}")
fi

docker run -d \
  --name "${APP_CONTAINER}" \
  --restart unless-stopped \
  --network "${NETWORK}" \
  --security-opt seccomp=unconfined \
  --security-opt apparmor=unconfined \
  "${ENV_ARGS[@]}" \
  -v "${DATA_DIR}:/app/data" \
  -v /home/sato/.codex:/root/.codex \
  -e HOME=/root \
  -e OX_LOGIN_ID=oyo \
  -e OX_LOGIN_PASS=oxai \
  -e OX_CODEX_ENABLED=1 \
  -e OX_CODEX_ON_CREATE=1 \
  -e OX_CODEX_ON_IMPROVE=1 \
  "${IMAGE}"

sudo -u sato env HOME=/home/sato cloudflared tunnel route dns --overwrite-dns "${TUNNEL_ID}" "${HOSTNAME}"

cat > "${CLOUDFLARED_DIR}/${TUNNEL_NAME}.yml" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /etc/cloudflared/${TUNNEL_ID}.json
ingress:
  - hostname: ${HOSTNAME}
    service: http://${APP_CONTAINER}:3400
  - service: http_status:404
EOF

docker run -d \
  --name "${TUNNEL_CONTAINER}" \
  --restart unless-stopped \
  --user 0 \
  --network "${NETWORK}" \
  -v "${CLOUDFLARED_DIR}:/etc/cloudflared:ro" \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate --config "/etc/cloudflared/${TUNNEL_NAME}.yml" run

sudo -u sato env HOME=/home/sato cloudflared tunnel delete -f ox-ai-workshop-demo-v2 2>/dev/null || true
sudo -u sato env HOME=/home/sato cloudflared tunnel delete -f ox-ai-workshop-demo-v3 2>/dev/null || true
sudo -u sato env HOME=/home/sato cloudflared tunnel delete -f ox-ai-workshop-demo-v4 2>/dev/null || true

docker ps --format "{{.Names}} {{.Image}} {{.Status}}" | grep ox-ai-workshop || true
