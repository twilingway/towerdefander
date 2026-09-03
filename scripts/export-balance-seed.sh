#!/usr/bin/env bash
#
# Promotes the live balance into the committed seed.
#
# The volume is where the console writes and where the game reads; the seed is
# what a host that has never run the game starts from. They drift on purpose --
# a release must never push a checkout's numbers over tuning someone saved
# before a session. This is the deliberate act that closes the gap, and it ends
# with a normal review and commit.
#
#   scripts/export-balance-seed.sh [--out <path>]
set -euo pipefail

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO_ROOT}/apps/server/presets/production.json"
VOLUME="${BALANCE_VOLUME:-space_space-api-data}"

while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      OUT="${2:?--out needs a path}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if ! docker volume inspect "${VOLUME}" >/dev/null 2>&1; then
  echo "No Docker volume named ${VOLUME}." >&2
  exit 1
fi

mkdir -p "$(dirname "${OUT}")"
temporary="$(mktemp)"
trap 'rm -f "${temporary}"' EXIT

docker run --rm -v "${VOLUME}:/data" alpine cat /data/balance.json >"${temporary}"

# A truncated or unparsable export is worse than none: it would be committed and
# then seed the next host.
node -e "
const { readFileSync } = require('node:fs');
const document = JSON.parse(readFileSync(process.argv[1], 'utf8'));
if (!Array.isArray(document.presets) || document.presets.length === 0) {
  throw new Error('The exported document holds no presets.');
}
console.log(
  'version ' + document.version +
  ', active ' + document.activePresetId +
  ', ' + document.presets.length + ' preset(s)'
);
" "${temporary}"

mv "${temporary}" "${OUT}"
trap - EXIT
echo "Wrote ${OUT}"
echo "Review it and commit; the next host without a balance volume will start on it."
