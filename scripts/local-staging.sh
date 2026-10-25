#!/usr/bin/env bash
# Local staging: the production Docker image, multi-tenant, built from the pushed v2 (like
# staging.bookly-app.io is built from main), with its own database, Mailpit and job worker.
# See deploy/local-staging/compose.yml and CONTRIBUTING.md ("Local staging").
#
#   scripts/local-staging.sh up        build the image if missing, start, seed on first run
#   scripts/local-staging.sh update    fetch, rebuild from the latest v2, restart (migrations run)
#   scripts/local-staging.sh status    containers and health
#   scripts/local-staging.sh logs      follow the app's log
#   scripts/local-staging.sh down      stop (data stays); `down --wipe` drops the data too
#
# REF picks what to build: a git ref (default origin/v2), or REF=worktree for this checkout as it
# is, uncommitted changes included.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/deploy/local-staging"
ENV_FILE="$DIR/.env"
REF="${REF:-origin/v2}"
IMAGE="bookly:staging"
URL="http://localhost:3100"
compose() { docker compose -f "$DIR/compose.yml" --env-file /dev/null "$@"; }

secrets() {
  [ -f "$ENV_FILE" ] && return
  umask 077
  cat >"$ENV_FILE" <<EOF
# Local staging only (git-ignored). Add Stripe test keys, DAILY_API_KEY, ANTHROPIC_API_KEY or
# OAuth apps here to switch those on; then: scripts/local-staging.sh up
AUTH_SECRET=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 32)
EMAIL_FROM=Bookly Staging <noreply@staging.localhost>
PLATFORM_ADMIN_EMAILS=demo@example.com
SUPPORT_EMAIL=support@staging.localhost
EOF
  echo "Wrote $ENV_FILE with fresh secrets."
}

build() {
  if [ "$REF" = "worktree" ]; then
    echo "Building $IMAGE from this checkout (uncommitted changes included)…"
    docker build -t "$IMAGE" "$ROOT"
  else
    git -C "$ROOT" fetch -q origin
    local sha
    sha="$(git -C "$ROOT" rev-parse --short "$REF")"
    echo "Building $IMAGE from $REF ($sha)…"
    # Exactly what is committed at REF: the archive is the build context.
    git -C "$ROOT" archive --format=tar "$REF" | docker build -t "$IMAGE" --label "bookly.ref=$REF@$sha" -
  fi
}

wait_healthy() {
  echo -n "Waiting for $URL "
  for _ in $(seq 1 90); do
    if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
      echo " up."
      return
    fi
    echo -n "."
    sleep 2
  done
  echo
  echo "The app didn't come up. Its log:" >&2
  compose logs --tail 80 app >&2
  exit 1
}

seed() {
  # The demo workspace (demo.localhost:3100, demo@example.com / demo-password-1234) through the
  # same seed the e2e suite uses, run from this checkout against the staging database.
  echo "Seeding the demo workspace…"
  (cd "$ROOT/apps/web" &&
    DATABASE_URL=postgres://bookly:bookly@localhost:5434/bookly TENANCY=multi APP_URL="$URL" \
      ROOT_DOMAIN=localhost:3100 EMAIL_DRIVER=console pnpm -s demo >/dev/null)
  # Everything in beta is on here, as on staging: hiring, pipelines, rules, forms.
  local keys
  keys="$(awk '/^export const FLAGS = \{/{f=1;next} f&&/^\}/{exit} f&&match($0,/^  [a-z_0-9]+:/){print substr($0,3,RLENGTH-3)}' "$ROOT/apps/web/src/server/flags.ts")"
  for k in $keys; do
    compose exec -T postgres psql -q -U bookly -d bookly -c \
      "insert into feature_flags (key, description, state) values ('$k', '$k', 'on')
       on conflict (key) do update set state = 'on'" >/dev/null
  done
  echo "Flags on: $(echo $keys | tr ' ' ',')"
}

summary() {
  cat <<EOF

Local staging is running ($(docker image inspect -f '{{index .Config.Labels "bookly.ref"}}' "$IMAGE" 2>/dev/null || echo "$IMAGE")):
  Platform   $URL            (console: sign in as demo@example.com)
  Demo       http://demo.localhost:3100/admin   demo@example.com / demo-password-1234
  Email      http://localhost:8026  (Mailpit)
  Database   postgres://bookly:bookly@localhost:5434/bookly
EOF
}

case "${1:-up}" in
  up)
    secrets
    docker image inspect "$IMAGE" >/dev/null 2>&1 || build
    compose up -d
    wait_healthy
    if ! compose exec -T postgres psql -tA -U bookly -d bookly -c \
      "select 1 from workspaces where slug = 'demo'" | grep -q 1; then
      seed
    fi
    summary
    ;;
  update)
    secrets
    build
    compose up -d --force-recreate app
    wait_healthy
    summary
    ;;
  seed) seed ;;
  status)
    compose ps
    curl -fsS "$URL/api/health" && echo
    ;;
  logs) compose logs -f --tail 100 app ;;
  down)
    if [ "${2:-}" = "--wipe" ]; then compose down -v; else compose down; fi
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 1
    ;;
esac
