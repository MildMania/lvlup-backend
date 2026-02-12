#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "${BACKEND_DIR}/.." && pwd)"
BRANCH="${WORKER_BRANCH:-main}"

if [[ -f "${BACKEND_DIR}/.worker.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${BACKEND_DIR}/.worker.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[worker-redeploy] DATABASE_URL is missing. Set it in backend/.worker.env or environment."
  exit 1
fi

echo "[worker-redeploy] repo=${REPO_DIR} branch=${BRANCH}"

cd "${REPO_DIR}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[worker-redeploy] Working tree is dirty. Commit/stash changes before redeploy."
  exit 1
fi

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

cd "${BACKEND_DIR}"
npm ci --no-audit --no-fund
npm run build

pm2 start ecosystem.worker.config.cjs --only lvlup-worker --update-env
pm2 save

echo "[worker-redeploy] done"
