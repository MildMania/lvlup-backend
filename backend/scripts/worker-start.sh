#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${BACKEND_DIR}/.worker.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${BACKEND_DIR}/.worker.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[worker-start] DATABASE_URL is missing. Set it in backend/.worker.env or environment."
  exit 1
fi

cd "${BACKEND_DIR}"

npm run build
pm2 start ecosystem.worker.config.cjs --only lvlup-worker --update-env
pm2 save
pm2 status lvlup-worker
