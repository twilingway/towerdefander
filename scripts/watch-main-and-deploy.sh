#!/usr/bin/env bash
#
# Deploy agent. Asks GitHub what the release branch points at, and releases it
# once its quality gate is green.
#
# The machine pulls; GitHub never pushes. That is deliberate: the repository is
# public, and a self-hosted runner on a public repository executes the workflow
# file carried by a pull request from a fork -- on a machine that also hosts
# unrelated services. Polling costs an interval of latency and executes nothing
# that did not come from the release branch.
#
# Started by launchd on an interval; safe to run by hand at any time.
set -euo pipefail

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

SPACE_PROD_DIR="${SPACE_PROD_DIR:-$HOME/space-prod}"
ENV_FILE="${SPACE_PROD_DIR}/.env.production"
REPO_DIR="${SPACE_PROD_DIR}/repo"
STATE_DIR="${SPACE_PROD_DIR}/state"
LOG_FILE="${STATE_DIR}/agent.log"
LOCK_DIR="${STATE_DIR}/deploy.lock"
# GitHub allows an unauthenticated caller 60 requests an hour per address. The
# agent wakes far more often than that, so it only asks about a commit it has
# not just asked about.
CHECK_QUERY_INTERVAL_SECONDS=300

mkdir -p "${STATE_DIR}"

log() {
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S') $*"
  echo "${line}"
  echo "${line}" >>"${LOG_FILE}"
}

[ -f "${ENV_FILE}" ] || {
  log "No environment file at ${ENV_FILE}; nothing to do."
  exit 0
}
[ -d "${REPO_DIR}/.git" ] || {
  log "No git checkout at ${REPO_DIR}; nothing to do."
  exit 0
}

# shellcheck disable=SC1090
set -a
. "${ENV_FILE}"
set +a

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
if [ -z "${DEPLOY_REPO:-}" ]; then
  log "DEPLOY_REPO is not set; cannot ask about check status."
  exit 0
fi

# An atomic claim, and one that survives a killed run: the directory holds the
# pid that made it, so a lock whose owner is gone is not a permanent stop.
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  owner="$(cat "${LOCK_DIR}/pid" 2>/dev/null || echo "")"
  if [ -n "${owner}" ] && kill -0 "${owner}" 2>/dev/null; then
    exit 0
  fi
  log "Clearing a lock left by pid ${owner:-unknown}."
  rm -rf "${LOCK_DIR}"
  mkdir "${LOCK_DIR}"
fi
echo "$$" >"${LOCK_DIR}/pid"
trap 'rm -rf "${LOCK_DIR}"' EXIT

remote_sha="$(git -C "${REPO_DIR}" ls-remote origin "refs/heads/${DEPLOY_BRANCH}" 2>/dev/null | cut -f1)"
if [ -z "${remote_sha}" ]; then
  log "Could not read origin/${DEPLOY_BRANCH}."
  exit 0
fi

deployed_sha="$(cat "${STATE_DIR}/deployed-sha" 2>/dev/null || true)"
if [ "${remote_sha}" = "${deployed_sha}" ]; then
  exit 0
fi

# Back off on a commit that was asked about recently: a red branch would
# otherwise burn the hourly allowance within the hour.
last_query_sha="$(cat "${STATE_DIR}/last-query-sha" 2>/dev/null || true)"
last_query_at="$(cat "${STATE_DIR}/last-query-at" 2>/dev/null || echo 0)"
now="$(date +%s)"
if [ "${remote_sha}" = "${last_query_sha}" ] &&
  [ $((now - last_query_at)) -lt ${CHECK_QUERY_INTERVAL_SECONDS} ]; then
  exit 0
fi
echo "${remote_sha}" >"${STATE_DIR}/last-query-sha"
echo "${now}" >"${STATE_DIR}/last-query-at"

# pending | green | red | missing
verdict="$(
  curl -fsS -m 20 \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "https://api.github.com/repos/${DEPLOY_REPO}/commits/${remote_sha}/check-runs" 2>/dev/null |
    node -e "
let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    console.log('missing');
    return;
  }
  const runs = Array.isArray(body.check_runs) ? body.check_runs : [];
  if (runs.length === 0) {
    console.log('missing');
    return;
  }
  if (runs.some((run) => run.status !== 'completed')) {
    console.log('pending');
    return;
  }
  const passing = new Set(['success', 'skipped', 'neutral']);
  console.log(runs.every((run) => passing.has(run.conclusion)) ? 'green' : 'red');
});
" || echo "missing"
)"

case "${verdict}" in
  green)
    log "Gate is green for ${remote_sha}; releasing."
    if "${REPO_DIR}/scripts/deploy-production.sh" --sha "${remote_sha}"; then
      log "Released ${remote_sha}."
    else
      log "Release of ${remote_sha} failed; see deploy.log."
    fi
    ;;
  pending | missing)
    log "Gate is not finished for ${remote_sha}; waiting."
    ;;
  red)
    log "Gate failed for ${remote_sha}; keeping the current release."
    ;;
  *)
    log "Could not read check status for ${remote_sha}; waiting."
    ;;
esac
