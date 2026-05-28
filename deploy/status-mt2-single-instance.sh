#!/usr/bin/env bash
set -euo pipefail

echo "== containers =="
docker ps -a --format "{{.Names}} {{.Image}} {{.Status}}" | grep ox-ai-workshop || true

echo
echo "== tunnels =="
sudo -u sato env HOME=/home/sato cloudflared tunnel list | grep ox-ai-workshop || true

echo
echo "== app health =="
if docker container inspect ox-ai-workshop-builder >/dev/null 2>&1; then
  docker exec ox-ai-workshop-builder node -e "fetch('http://127.0.0.1:3400/api/me').then(async r=>console.log(r.status, await r.text())).catch(e=>{console.error(e.message); process.exit(1);})"
else
  echo "ox-ai-workshop-builder is not present"
fi

echo
echo "== deploy timer =="
systemctl is-active ox-ai-workshop-deploy.timer || true
systemctl list-timers ox-ai-workshop-deploy.timer --no-pager || true

echo
echo "== codex worker timer =="
systemctl is-active ox-ai-workshop-codex-worker.timer || true
systemctl list-timers ox-ai-workshop-codex-worker.timer --no-pager || true

echo
echo "== deploy status =="
cat /home/sato/ox-ai-workshop-builder/data/deploy-status.json 2>/dev/null || echo "no deploy status yet"
