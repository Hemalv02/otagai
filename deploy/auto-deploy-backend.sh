#!/usr/bin/env bash
set -euo pipefail
umask 077

project="${HOME}/otagai"
state="${HOME}/.local/share/otagai-deploy"
source_repo="$state/source.git"
ready_url="https://otagai.hemal.me/ready"
request="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$request" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  requested_commit="${BASH_REMATCH[1]}"
elif [[ "$request" != verify ]]; then
  printf '%s\n' 'Expected verify or deploy <commit SHA>.' >&2
  exit 2
fi

exec 9>"$state/deploy.lock"
flock -w 180 9

export GIT_TERMINAL_PROMPT=0
git --git-dir="$source_repo" fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
commit=$(git --git-dir="$source_repo" rev-parse refs/remotes/origin/main)
tree=$(git --git-dir="$source_repo" rev-parse "$commit:backend")
compose=(docker compose --project-directory "$project" --env-file "$project/.env.production" -f "$project/compose.prod.yaml")

if [[ "$request" == verify ]]; then
  "${compose[@]}" config --quiet
  curl --fail --silent --show-error --max-time 10 "$ready_url"
  printf '\nGitHub main %s is available for deployment.\n' "$commit"
  exit 0
fi

# Fetch the latest main under the lock so a delayed workflow cannot deploy old code.
if ! git --git-dir="$source_repo" merge-base --is-ancestor "$requested_commit" "$commit"; then
  printf '%s\n' 'The requested commit is outside the current main branch.' >&2
  exit 1
fi

release="$state/releases/$tree"
if [[ -f "$state/deployed-backend-tree" ]] &&
   [[ "$(<"$state/deployed-backend-tree")" == "$tree" ]] &&
   [[ "$(readlink "$project/backend")" == "$release/backend" ]] &&
   curl --fail --silent --show-error --max-time 10 "$ready_url" > /dev/null; then
  printf 'Backend tree %s is already deployed and ready.\n' "$tree"
  exit 0
fi

staging=$(mktemp -d "$state/staging.XXXXXX")
trap 'rm -rf -- "$staging"' EXIT

if [[ ! -d "$release" ]]; then
  mkdir -p "$state/releases" "$staging/source"
  git --git-dir="$source_repo" archive "$commit" backend | tar -xf - -C "$staging/source"
  test -f "$staging/source/backend/Dockerfile"
  mv -- "$staging/source" "$release"
fi

# Build from the staged release before changing the deployment's source path.
cat > "$staging/build.yaml" <<YAML
services:
  migrate: &backend
    build: $release/backend
  backend: *backend
  ripple-scheduler: *backend
  push-dispatch: *backend
  worker: *backend
YAML
services=(migrate backend ripple-scheduler push-dispatch worker)
printf 'Building the backend from %s.\n' "$commit"
"${compose[@]}" -f "$staging/build.yaml" build "${services[@]}"

ln -s -- "$release/backend" "$staging/backend-link"
if [[ -d "$project/backend" && ! -L "$project/backend" ]]; then
  # Keep the original source from the manual deployment.
  mv -T -- "$project/backend" "$state/initial-backend"
  if ! mv -Tf -- "$staging/backend-link" "$project/backend"; then
    mv -T -- "$state/initial-backend" "$project/backend"
    exit 1
  fi
else
  mv -Tf -- "$staging/backend-link" "$project/backend"
fi

# Compose waits for the migrate service before starting the backend and worker.
"${compose[@]}" up --detach --no-build --wait --wait-timeout 240 backend ripple-scheduler push-dispatch worker
curl --fail --silent --show-error --retry 6 --retry-all-errors --retry-delay 2 --max-time 10 "$ready_url"
printf '%s\n' "$tree" > "$staging/deployed-backend-tree"
mv -- "$staging/deployed-backend-tree" "$state/deployed-backend-tree"
printf '\nProduction backend is ready at %s.\n' "$commit"
