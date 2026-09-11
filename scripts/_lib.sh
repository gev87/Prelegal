# Shared by the mac and linux scripts. Sourced, never run directly.
#
# The two differ only in how you are told to start Docker, so that string is
# the argument and everything else lives here — a port check that drifts
# between two copies is a bug nobody notices until it matters.

set -euo pipefail

IMAGE="prelegal"
CONTAINER="prelegal"
PORT="8000"

repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
}

# $1: what to tell the reader to do about a stopped Docker.
require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. See https://docs.docker.com/get-docker/" >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed but not running. $1" >&2
    exit 1
  fi
}

# Refuses to start only when something *else* holds the port. A container of
# ours is not a conflict — it is the thing about to be replaced.
require_free_port() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  if ! lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    return 0
  fi

  if docker ps --filter "name=^${CONTAINER}$" --format '{{.Names}}' | grep -q .; then
    return 0
  fi

  echo "Port ${PORT} is already in use by something that is not Prelegal." >&2
  echo "Stop it, or run the stop script if a previous container is lingering." >&2
  exit 1
}

# The assistant's key, from the environment or from an untracked .env file at
# the repository root. Absent is not an error: the product runs without it,
# and only the chat panel reports itself unavailable. Warning rather than
# failing keeps `start` working for anyone who just wants to read the
# document — see backend/app/llm.py.
openrouter_key() {
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    printf %s "${OPENROUTER_API_KEY}"
    return 0
  fi

  local env_file="$(repo_root)/.env"
  [ -f "${env_file}" ] || return 0

  # Only this one name, and only the part after the first "=", so a value
  # containing "=" survives and nothing else in the file is executed.
  #
  # The `|| true` is load-bearing. grep exits 1 when it matches nothing, and
  # under `set -e` that would take the whole script down over the entirely
  # ordinary case of a .env holding other settings but not this one.
  sed -n 's/^OPENROUTER_API_KEY=//p' "${env_file}" 2>/dev/null \
    | head -n 1 \
    | tr -d '\042\015' || true

  return 0
}

# Clears a container left behind by a crash or a bare `docker stop`, so that
# starting twice in a row never fails with "name already in use".
remove_existing_container() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}

# Reports a URL that actually answers, rather than one that merely has a
# container behind it.
wait_until_ready() {
  for _ in $(seq 1 30); do
    if curl -fsS "http://localhost:${PORT}/healthz" >/dev/null 2>&1; then
      echo "Prelegal is ready at http://localhost:${PORT}"
      return 0
    fi
    sleep 1
  done

  echo "Prelegal started but is not answering yet." >&2
  echo "Check the logs with: docker logs ${CONTAINER}" >&2
  return 1
}

start_prelegal() {
  require_docker "$1"
  require_free_port

  cd "$(repo_root)"

  # Always rebuilt. The layer cache makes an unchanged rebuild near-instant,
  # and it removes the whole class of "why is it still running the old code".
  docker build -t "${IMAGE}" .

  remove_existing_container

  # Passed at run time, never baked in with ENV: a key in a layer is a key in
  # every copy of the image.
  key="$(openrouter_key)"
  if [ -z "${key}" ]; then
    echo "No OPENROUTER_API_KEY found, so the AI chat will be unavailable." >&2
    echo "Set it in your shell or in .env — see .env.example." >&2
  fi

  docker run -d --name "${CONTAINER}" -p "${PORT}:8000"     -e "OPENROUTER_API_KEY=${key}" "${IMAGE}" >/dev/null

  wait_until_ready
}

stop_prelegal() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running; nothing to stop."
    return 0
  fi

  if ! docker ps -a --filter "name=^${CONTAINER}$" --format '{{.Names}}' | grep -q .; then
    echo "Prelegal is not running."
    return 0
  fi

  docker rm -f "${CONTAINER}" >/dev/null
  echo "Prelegal stopped."
}
