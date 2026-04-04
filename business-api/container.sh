#!/bin/sh
set -e

CMD=$1

case "$CMD" in
  build)
    docker compose up --build
    ;;
  start)
    docker compose up
    ;;
  stop)
    docker compose down
    ;;
  restart)
    docker compose down
    docker compose up
    ;;
  sh)
    docker compose exec business-api sh
    ;;
  exec)
    shift
    docker compose exec business-api sh -c "$*"
    ;;
  *)
    echo "Usage: $0 {build|start|stop|restart|sh|exec <command>}"
    exit 1
    ;;
esac
