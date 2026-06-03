#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${OX_APP_DIR:-/home/sato/ox-ai-workshop-builder}"
DATA_DIR="${APP_DIR}/data"
ENV_FILE="${APP_DIR}/.deploy.env"
CLOUDFLARED_DIR="${OX_CLOUDFLARED_DIR:-/home/sato/.cloudflared}"
NETWORK="${OX_DOCKER_NETWORK:-ox-ai-net}"
IMAGE="${OX_DOCKER_IMAGE:-ox-ai-workshop-builder:local}"
APP_CONTAINER="${OX_APP_CONTAINER:-ox-ai-workshop-builder}"
TUNNEL_CONTAINER="${OX_TUNNEL_CONTAINER:-ox-ai-workshop-tunnel}"
TUNNEL_NAME="${OX_TUNNEL_NAME:-ox-ai-workshop-demo-11-81}"
HOSTNAME="${OX_HOSTNAME:-demo.ox-ai-app.com}"
INSTALL_CODEX="${OX_INSTALL_CODEX:-0}"

cd "${APP_DIR}"

docker build --build-arg INSTALL_CODEX="${INSTALL_CODEX}" -t "${IMAGE}" .

remove_container() {
  local name="$1"
  if docker container inspect "${name}" >/dev/null 2>&1; then
    docker update --restart=no "${name}" >/dev/null 2>&1 || true
    timeout 20s docker rm -f "${name}" >/dev/null 2>&1 || {
      echo "ERROR: failed to remove ${name}" >&2
      docker ps -a --format "{{.Names}} {{.Image}} {{.Status}}" >&2 || true
      exit 1
    }
  fi
}

remove_container "${APP_CONTAINER}"
remove_container "${TUNNEL_CONTAINER}"

docker network inspect "${NETWORK}" >/dev/null 2>&1 || docker network create "${NETWORK}" >/dev/null
mkdir -p "${DATA_DIR}"
APP_UID="$(id -u)"
APP_GID="$(id -g)"
docker run --rm \
  -v "${DATA_DIR}:/app-data" \
  node:22-bookworm-slim \
  chown -R "${APP_UID}:${APP_GID}" /app-data >/dev/null 2>&1 || true

ENV_ARGS=()
if [[ -f "${ENV_FILE}" ]]; then
  ENV_ARGS+=(--env-file "${ENV_FILE}")
fi

docker run -d \
  --name "${APP_CONTAINER}" \
  --restart unless-stopped \
  --network "${NETWORK}" \
  --user "${APP_UID}:${APP_GID}" \
  "${ENV_ARGS[@]}" \
  -v "${DATA_DIR}:/app/data" \
  -e HOME=/tmp \
  -e OX_LOGIN_ID="${OX_LOGIN_ID:-oyo}" \
  -e OX_LOGIN_PASS="${OX_LOGIN_PASS:-oxai}" \
  -e OX_CODEX_ENABLED="${OX_CODEX_ENABLED:-1}" \
  -e OX_CODEX_EXTERNAL="${OX_CODEX_EXTERNAL:-1}" \
  -e OX_CODEX_ON_CREATE="${OX_CODEX_ON_CREATE:-1}" \
  -e OX_CODEX_ON_IMPROVE="${OX_CODEX_ON_IMPROVE:-1}" \
  "${IMAGE}" >/dev/null

if [[ "${OX_SKIP_TUNNEL:-0}" != "1" ]]; then
  get_tunnel_id() {
    cloudflared tunnel list --output json | node -e '
      let input = "";
      process.stdin.on("data", (chunk) => input += chunk);
      process.stdin.on("end", () => {
        const name = process.argv[1];
        const tunnels = JSON.parse(input);
        const hit = tunnels.find((t) => t.name === name && (!t.deleted_at || t.deleted_at.startsWith("0001")));
        if (hit) process.stdout.write(hit.id);
      });
    ' "${TUNNEL_NAME}"
  }

  mkdir -p "${CLOUDFLARED_DIR}"
  TUNNEL_ID="$(get_tunnel_id)"
  if [[ -z "${TUNNEL_ID}" ]]; then
    cloudflared tunnel create "${TUNNEL_NAME}"
    TUNNEL_ID="$(get_tunnel_id)"
  fi
  if [[ -z "${TUNNEL_ID}" ]]; then
    echo "ERROR: failed to resolve Cloudflare tunnel id for ${TUNNEL_NAME}" >&2
    exit 1
  fi
  if [[ ! -f "${CLOUDFLARED_DIR}/${TUNNEL_ID}.json" ]]; then
    echo "ERROR: tunnel credentials not found: ${CLOUDFLARED_DIR}/${TUNNEL_ID}.json" >&2
    exit 1
  fi

  cat > "${CLOUDFLARED_DIR}/${TUNNEL_NAME}.yml" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /etc/cloudflared/${TUNNEL_ID}.json
ingress:
  - hostname: ${HOSTNAME}
    service: http://${APP_CONTAINER}:3400
  - service: http_status:404
EOF

  cloudflared tunnel route dns --overwrite-dns "${TUNNEL_ID}" "${HOSTNAME}"

  docker run -d \
    --name "${TUNNEL_CONTAINER}" \
    --restart unless-stopped \
    --user 0 \
    --network "${NETWORK}" \
    -v "${CLOUDFLARED_DIR}:/etc/cloudflared:ro" \
    cloudflare/cloudflared:latest \
    tunnel --no-autoupdate --config "/etc/cloudflared/${TUNNEL_NAME}.yml" run >/dev/null
fi

docker ps --format "{{.Names}} {{.Image}} {{.Status}}" | grep -E "^(${APP_CONTAINER}|${TUNNEL_CONTAINER})\\b" || true
