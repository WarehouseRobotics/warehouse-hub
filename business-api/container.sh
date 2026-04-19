#!/bin/sh
set -e

NETWORK_NAME=warehouse-hub
CMD=$1

ensure_network() {
  docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 || docker network create "$NETWORK_NAME" >/dev/null
}

case "$CMD" in
  build)
    ensure_network
    docker compose down
    docker compose up --build
    ;;
  start)
    ensure_network
    docker compose up
    ;;
  startd)
    ensure_network
    docker compose up -d
    ;;
  stop)
    docker compose stop
    ;;
  remove)
    docker compose down
    ;;
  restart)
    ensure_network
    docker compose down
    docker compose up
    ;;
  sh)
    docker compose exec business-api sh
    ;;
  exec)
    shift
    if [ "$#" -eq 0 ]; then
      echo "Usage: $0 exec <command> <command arguments>}"
      exit 1
    fi

    docker compose exec business-api "$@"
    ;;
  *)
    echo "Usage: $0 {build|start|stop|remove|restart|sh|exec <command>}"
    exit 1
    ;;
esac
