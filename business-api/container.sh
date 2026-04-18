#!/bin/sh
set -e

CMD=$1

case "$CMD" in
  build)
    docker compose down
    docker compose up --build
    ;;
  start)
    docker compose up
    ;;
  startd)
    docker compose up -d
    ;;
  stop)
    docker compose stop
    ;;
  remove)
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
