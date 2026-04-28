#!/bin/sh
set -e

NETWORK_NAME=warehouse-hub
CMD=$1

ensure_network() {
  docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 || docker network create "$NETWORK_NAME" >/dev/null
}

show_status() {
  SERVICE_NAME=$1
  CONTAINER_ID=$(docker compose ps -q "$SERVICE_NAME")

  if [ -z "$CONTAINER_ID" ]; then
    echo "$SERVICE_NAME: not running"
    return
  fi

  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_ID")" = "true" ]; then
    echo "$SERVICE_NAME: running"
    echo "Container ID: $CONTAINER_ID"
  else
    echo "$SERVICE_NAME: not running"
  fi
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
  status)
    show_status business-api
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
    echo "Usage: $0 {build|start|startd|stop|status|remove|restart|sh|exec <command>}"
    exit 1
    ;;
esac
