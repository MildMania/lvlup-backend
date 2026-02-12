#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "${BACKEND_DIR}/.." && pwd)"
BRANCH="${WORKER_BRANCH:-main}"

cd "${REPO_DIR}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[worker-auto-update] Dirty working tree. Skipping."
  exit 0
fi

git fetch --quiet origin "${BRANCH}"

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/${BRANCH}")"

if [[ "${LOCAL_SHA}" == "${REMOTE_SHA}" ]]; then
  echo "[worker-auto-update] Already up to date (${LOCAL_SHA})."
  exit 0
fi

echo "[worker-auto-update] Update found ${LOCAL_SHA} -> ${REMOTE_SHA}. Redeploying."
"${BACKEND_DIR}/scripts/worker-redeploy.sh"
