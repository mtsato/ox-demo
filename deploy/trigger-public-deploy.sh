#!/usr/bin/env bash
set -euo pipefail

DEPLOY_URL="${OX_DEPLOY_URL:-https://demo.ox-ai-app.com/api/deploy}"
STATUS_URL="${OX_DEPLOY_STATUS_URL:-https://demo.ox-ai-app.com/api/deploy/status}"
TOKEN="${OX_DEPLOY_TOKEN:-}"
REF="${1:-main}"

if [[ -z "${TOKEN}" ]]; then
  echo "OX_DEPLOY_TOKEN is required" >&2
  exit 1
fi

curl -fsS -X POST "${DEPLOY_URL}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"ref\":\"${REF}\"}"

echo
curl -fsS "${STATUS_URL}" \
  -H "Authorization: Bearer ${TOKEN}"
echo
