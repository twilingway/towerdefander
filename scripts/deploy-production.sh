#!/usr/bin/env bash
#
# One production release, start to finish: wait for live rooms to close, build
# the images for a commit, switch the stack onto them, verify the result, and
# put the previous images back if the verification fails.
#
# Safe to run twice: the same commit rebuilds to the same tag and the stack ends
# up in the same place.
#
#   scripts/deploy-production.sh [--sha <commit>] [--skip-drain] [--no-smoke]
#
# Configuration comes from $SPACE_PROD_DIR/.env.production (see
# .env.production.example). Nothing secret is passed on a command line, and
# nothing secret is written to the log.
set -euo pipefail

# launchd hands a job a minimal PATH, and this script needs docker, git and pnpm.
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

SPACE_PROD_DIR="${SPACE_PROD_DIR:-$HOME/space-prod}"
ENV_FILE="${SPACE_PROD_DIR}/.env.production"
REPO_DIR="${SPACE_PROD_DIR}/repo"
STATE_DIR="${SPACE_PROD_DIR}/state"
LOG_FILE="${STATE_DIR}/deploy.log"
COMPOSE_PROJECT="space"
# How many previous releases stay on disk, so a rollback has something to roll
# back to and the disk does not fill with every commit ever shipped.
KEEP_RELEASES=3

TARGET_SHA=""
SKIP_DRAIN=0
RUN_SMOKE=1

while [ $# -gt 0 ]; do
  case "$1" in
    --sha)
      TARGET_SHA="${2:-}"
      shift 2
      ;;
    --skip-drain)
      SKIP_DRAIN=1
      shift
      ;;
    --no-smoke)
      RUN_SMOKE=0
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "${STATE_DIR}"

log() {
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S') $*"
  echo "${line}"
  echo "${line}" >>"${LOG_FILE}"
}

die() {
  log "ERROR: $*"
  exit 1
}

[ -f "${ENV_FILE}" ] || die "No environment file at ${ENV_FILE}; copy .env.production.example there."
[ -d "${REPO_DIR}/.git" ] || die "No git checkout at ${REPO_DIR}."

# shellcheck disable=SC1090
set -a
. "${ENV_FILE}"
set +a

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
# What players are told: the countdown they see, and the room-free wait after it.
DEPLOY_ANNOUNCE_MINUTES="${DEPLOY_ANNOUNCE_MINUTES:-60}"
DEPLOY_DRAIN_MINUTES="${DEPLOY_DRAIN_MINUTES:-30}"
PROXY_NETWORK="${PROXY_NETWORK:-public_net}"
COMPOSE_FILE="${REPO_DIR}/docker-compose.prod.yml"

# Compose ships either as a docker plugin or as its own binary, and this host
# has the standalone one. Both take the same flags; only the entry point moves.
if docker compose version >/dev/null 2>&1; then
  COMPOSE_COMMAND=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_COMMAND=(docker-compose)
else
  die "Neither 'docker compose' nor 'docker-compose' is available."
fi

compose() {
  "${COMPOSE_COMMAND[@]}" --project-name "${COMPOSE_PROJECT}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

# The API answers its own health and statistics from inside the container. Going
# through the published loopback port would work too, but it would make the
# release depend on how the local Docker runtime forwards ports.
api_node() {
  compose exec -T space-api node -e "$1"
}

live_room_count() {
  api_node "
const password = process.env.ROOM_STATS_PASSWORD ?? '';
const authorization = 'Basic ' + Buffer.from('admin:' + password).toString('base64');
fetch('http://127.0.0.1:2567/stats/rooms.json', { headers: { authorization } })
  .then((response) => (response.ok ? response.json() : Promise.reject(new Error('status ' + response.status))))
  .then((body) => { console.log(String(body.totals.rooms)); })
  .catch((error) => { console.error(error.message); process.exit(1); });
" 2>/dev/null | tr -d '\r'
}

wait_for_health() {
  local deadline=$((SECONDS + 120))
  while [ ${SECONDS} -lt ${deadline} ]; do
    if api_node "
fetch('http://127.0.0.1:2567/health')
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1));
" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# Announced before the wait, not after: a warning that arrives when the wait is
# over has nobody left to warn. From this moment the server refuses new rooms,
# so the pool drains on its own while the countdown runs.
announce_maintenance() {
  if ! compose ps --status running --services 2>/dev/null | grep -q '^space-api$'; then
    return 0
  fi
  local seconds=$((DEPLOY_ANNOUNCE_MINUTES * 60))
  if api_node "
const token = process.env.DEPLOY_CONTROL_TOKEN ?? '';
const authorization = 'Basic ' + Buffer.from('admin:' + token).toString('base64');
fetch('http://127.0.0.1:2567/admin/maintenance', {
  method: 'PUT',
  headers: { authorization, 'Content-Type': 'application/json' },
  body: JSON.stringify({ active: true, windowSeconds: ${seconds} })
})
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1));
" >/dev/null 2>&1; then
    log "Announced a ${DEPLOY_ANNOUNCE_MINUTES}-minute maintenance window; new rooms are refused."
    return 0
  fi
  # Worth saying out loud: without it the release still happens, but it happens
  # on top of players who were never told.
  log "WARNING: could not announce maintenance; releasing without warning anyone."
}

drain_rooms() {
  if [ "${SKIP_DRAIN}" = "1" ]; then
    log "Drain skipped by request."
    return 0
  fi
  if ! compose ps --status running --services 2>/dev/null | grep -q '^space-api$'; then
    log "Nothing is running yet; no rooms to drain."
    return 0
  fi
  local deadline=$((SECONDS + (DEPLOY_ANNOUNCE_MINUTES + DEPLOY_DRAIN_MINUTES) * 60))
  local count
  while [ ${SECONDS} -lt ${deadline} ]; do
    count="$(live_room_count || true)"
    if [ -z "${count}" ]; then
      log "Could not read room statistics; continuing without draining."
      return 0
    fi
    if [ "${count}" = "0" ]; then
      log "No live rooms; releasing now."
      return 0
    fi
    log "Waiting for ${count} live room(s) to close."
    sleep 20
  done
  # Deliberate: one room nobody closes must not become a permanent stop on
  # releases. Announcing this to the players is the maintenance-mode change.
  log "Announced window plus ${DEPLOY_DRAIN_MINUTES} minute(s) passed; releasing anyway."
}

# Writes the seed onto the volume and puts the server on it. The restart is what
# makes the numbers live: the file is placed behind the server's back, so unlike
# a console save nothing updates the state it holds in memory.
apply_balance_seed() {
  local seed="$1" volume="$2" revision="$3"
  # Over stdin rather than a bind mount: the checkout may live outside what the
  # Docker host can mount, and a mount is not needed to write one file.
  if ! docker run --rm -i -v "${volume}:/data" alpine sh -c 'cat > /data/balance.json' <"${seed}"; then
    return 1
  fi
  printf '%s\n' "${revision}" |
    docker run --rm -i -v "${volume}:/data" alpine sh -c 'cat > /data/.balance-seed-revision' ||
    true
  compose restart space-api >/dev/null 2>&1 || true
}

# The volume is the home of the balance the console writes; the committed seed
# is what a release delivers. Which of the two wins is decided by the revision
# beside the seed, and that number moves only when someone promotes a dev
# stand's balance on purpose -- so reformatting the file, or migrating it to a
# newer version, never reaches a playing crew on its own. Promoting live tuning
# back into the seed stays a separate act -- see scripts/export-balance-seed.sh.
seed_balance_volume() {
  local seed="${REPO_DIR}/apps/server/presets/production.json"
  local revision_file="${REPO_DIR}/apps/server/presets/production.revision"
  local volume="${COMPOSE_PROJECT}_space-api-data"
  if [ ! -f "${seed}" ]; then
    log "No seed preset in the checkout; the server will start on packaged defaults."
    return 0
  fi

  local checkout_revision=""
  if [ -f "${revision_file}" ]; then
    checkout_revision="$(tr -dc '0-9' <"${revision_file}")"
  fi
  : "${checkout_revision:=0}"

  # Read before the volume is touched: a truncated seed would replace a working
  # balance with nothing, and the crew would find that out mid-wave.
  if ! node -e "
const { readFileSync } = require('node:fs');
const document = JSON.parse(readFileSync(process.argv[1], 'utf8'));
if (!Array.isArray(document.presets) || document.presets.length === 0) {
  throw new Error('The seed holds no presets.');
}
" "${seed}" >/dev/null 2>&1; then
    log "The seed preset does not parse; the balance volume is left as it is."
    return 0
  fi

  if ! docker run --rm -v "${volume}:/data" alpine test -f /data/balance.json >/dev/null 2>&1; then
    log "Balance volume is empty; seeding it from the committed preset."
    if apply_balance_seed "${seed}" "${volume}" "${checkout_revision}"; then
      log "Seeded the balance volume at revision ${checkout_revision} and restarted the server onto it."
    else
      log "Could not seed the balance volume; the server stays on packaged defaults."
    fi
    return 0
  fi

  local applied_revision
  applied_revision="$(docker run --rm -v "${volume}:/data" alpine cat /data/.balance-seed-revision 2>/dev/null | tr -dc '0-9' || true)"

  if [ -z "${applied_revision}" ]; then
    # A host that was already playing before revisions existed. Reading the
    # missing number as zero would deliver the seed over tuning someone saved
    # before a session -- the very accident the old empty-only rule prevented --
    # so the number is adopted instead and delivery starts at the next promotion.
    printf '%s\n' "${checkout_revision}" |
      docker run --rm -i -v "${volume}:/data" alpine sh -c 'cat > /data/.balance-seed-revision' ||
      true
    log "Balance volume holds a saved balance and no revision; adopted ${checkout_revision} without touching it."
    return 0
  fi

  if [ "${checkout_revision}" -le "${applied_revision}" ]; then
    return 0
  fi

  log "Seed revision ${checkout_revision} is newer than ${applied_revision}; delivering it."
  # The copy is what makes the overwrite reversible: whatever was saved from the
  # console stays on the volume, named after the revision that replaced it.
  docker run --rm -v "${volume}:/data" alpine \
    cp /data/balance.json "/data/balance.pre-${checkout_revision}.json" >/dev/null 2>&1 || true
  if apply_balance_seed "${seed}" "${volume}" "${checkout_revision}"; then
    log "Delivered balance revision ${checkout_revision}; the previous file is /data/balance.pre-${checkout_revision}.json."
  else
    log "Could not write the balance volume; the saved balance stays in play."
  fi
}

# The check that was missing, and that cost two rolled-back releases.
#
# Health was measured with `compose exec` -- straight into the new container --
# while the smoke played through the public address. Those two disagree for a
# few seconds during a switch: the old container has thirty seconds to drain and
# the proxy keeps its address for a little while, so the smoke reaches the
# server that is on its way out. When a release also moves the protocol version,
# that old server refuses the new client, and the release reads it as broken
# code rather than as a switch still in progress.
#
# So the release now waits for the public address to answer with the version it
# is releasing, through the same path the game uses, before it believes
# anything.
wait_for_public_build() {
  local expected
  expected="$(grep -o 'PROTOCOL_VERSION = [0-9]*' "${REPO_DIR}/packages/protocol/src/index.ts" | grep -o '[0-9]*' | head -1)"
  if [ -z "${expected}" ]; then
    log "Could not read the protocol version from the checkout; skipping the public wait."
    return 0
  fi
  if [ -z "${PUBLIC_API_URL:-}" ]; then
    log "No public API address configured; skipping the public wait."
    return 0
  fi
  local origin="${PUBLIC_API_URL/#wss:/https:}"
  origin="${origin/#ws:/http:}"
  local deadline=$((SECONDS + 120))
  local served
  while [ ${SECONDS} -lt ${deadline} ]; do
    served="$(curl -fsS -m 10 "${origin}/health" 2>/dev/null |
      grep -o '"protocolVersion":[0-9]*' | grep -o '[0-9]*' | head -1)"
    if [ "${served}" = "${expected}" ]; then
      log "The public address is serving protocol ${expected}."
      return 0
    fi
    sleep 2
  done
  log "The public address still serves ${served:-nothing} where ${expected} was expected."
  return 1
}

roll_back() {
  local previous="$1"
  if [ -z "${previous}" ]; then
    log "No previous release recorded; cannot roll back."
    return 1
  fi
  if ! docker image inspect "spacedef-api:${previous}" >/dev/null 2>&1; then
    log "Previous images for ${previous} are gone; cannot roll back."
    return 1
  fi
  log "Rolling back to ${previous}."
  IMAGE_TAG="${previous}" compose up -d --remove-orphans
  if wait_for_health; then
    log "Rollback to ${previous} is healthy."
    return 0
  fi
  log "Rollback to ${previous} did not come up healthy."
  return 1
}

prune_releases() {
  local keep="$1"
  local history="${STATE_DIR}/tag-history"
  [ -f "${history}" ] || return 0
  local index=0
  local tag
  while IFS= read -r tag; do
    [ -n "${tag}" ] || continue
    index=$((index + 1))
    [ ${index} -le "${keep}" ] && continue
    for repository in spacedef-api spacedef-display spacedef-control spacedef-admin; do
      docker image rm "${repository}:${tag}" >/dev/null 2>&1 || true
    done
  done <"${history}"
  # Keep the file the same length as the images it describes.
  head -n "${keep}" "${history}" >"${history}.trimmed" && mv "${history}.trimmed" "${history}"
}

log "=== Release starting ==="

docker network inspect "${PROXY_NETWORK}" >/dev/null 2>&1 ||
  die "Docker network ${PROXY_NETWORK} does not exist; the reverse proxy owns it."

git -C "${REPO_DIR}" fetch --prune origin "${DEPLOY_BRANCH}" >/dev/null 2>&1 ||
  die "Could not fetch ${DEPLOY_BRANCH} from origin."
if [ -z "${TARGET_SHA}" ]; then
  TARGET_SHA="$(git -C "${REPO_DIR}" rev-parse "origin/${DEPLOY_BRANCH}")"
fi
TARGET_SHA="$(git -C "${REPO_DIR}" rev-parse "${TARGET_SHA}")"
SHORT_SHA="$(echo "${TARGET_SHA}" | cut -c1-12)"
git -C "${REPO_DIR}" checkout --quiet --detach "${TARGET_SHA}" ||
  die "Could not check out ${TARGET_SHA}."
log "Releasing ${SHORT_SHA} ($(git -C "${REPO_DIR}" log -1 --pretty=%s))"

PREVIOUS_TAG="$(cat "${STATE_DIR}/deployed-tag" 2>/dev/null || true)"
if [ "${PREVIOUS_TAG}" = "${SHORT_SHA}" ]; then
  log "Note: ${SHORT_SHA} is already the recorded release; rebuilding it."
fi

# Built before the drain wait, not after: the build is the slow, CPU-hungry part
# and it does not touch the running stack, so the players keep their tick while
# it happens.
log "Building images tagged ${SHORT_SHA}."
IMAGE_TAG="${SHORT_SHA}" compose build || die "Image build failed; the running release is untouched."

announce_maintenance
drain_rooms

log "Switching the stack onto ${SHORT_SHA}."
if ! IMAGE_TAG="${SHORT_SHA}" compose up -d --remove-orphans; then
  log "Compose could not start ${SHORT_SHA}."
  roll_back "${PREVIOUS_TAG}" || true
  die "Release ${SHORT_SHA} failed to start."
fi

seed_balance_volume

if ! wait_for_public_build; then
  log "The public address never started serving ${SHORT_SHA}."
  roll_back "${PREVIOUS_TAG}" || true
  die "Release ${SHORT_SHA} did not reach the public address."
fi

if ! wait_for_health; then
  log "Release ${SHORT_SHA} never answered its health check."
  roll_back "${PREVIOUS_TAG}" || true
  die "Release ${SHORT_SHA} is unhealthy."
fi
log "Health check passed."

if [ "${RUN_SMOKE}" = "1" ]; then
  log "Running the public smoke check."
  # The smoke client needs the workspace's own dependencies. A no-op once the
  # lockfile is unchanged, which is most releases.
  if ! (cd "${REPO_DIR}" && pnpm install --frozen-lockfile --filter "@spaceship-defender/controller..." >/dev/null 2>&1); then
    log "Could not install the smoke client's dependencies."
    roll_back "${PREVIOUS_TAG}" || true
    die "Release ${SHORT_SHA} could not be verified."
  fi
  if ! (cd "${REPO_DIR}" && node apps/controller/scripts/production-smoke.mjs); then
    log "Public smoke check failed for ${SHORT_SHA}."
    roll_back "${PREVIOUS_TAG}" || true
    die "Release ${SHORT_SHA} is serving but not playable."
  fi
  log "Public smoke check passed."
else
  log "Public smoke check skipped by request."
fi

echo "${SHORT_SHA}" >"${STATE_DIR}/deployed-tag"
echo "${TARGET_SHA}" >"${STATE_DIR}/deployed-sha"
# Newest first, and only once per tag.
{
  echo "${SHORT_SHA}"
  grep -v "^${SHORT_SHA}$" "${STATE_DIR}/tag-history" 2>/dev/null || true
} >"${STATE_DIR}/tag-history.next"
mv "${STATE_DIR}/tag-history.next" "${STATE_DIR}/tag-history"
prune_releases "${KEEP_RELEASES}"

log "=== Release ${SHORT_SHA} is live ==="
