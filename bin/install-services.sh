#!/bin/sh
# Installs the warehouse-hub services to the system

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)/bin
REPO_DIR=$(cd -- "$SCRIPT_DIR/../.." &> /dev/null && pwd)

echo "Installing warehouse-hub services to the system"

echo "  Installing openclaw-control-api service ..."
sudo cp "$REPO_DIR/openclaw-control-api/openclaw-control-api.service" /etc/systemd/user/openclaw-control-api.service
sudo systemctl daemon-reload
sudo systemctl enable openclaw-control-api
sudo systemctl start openclaw-control-api
