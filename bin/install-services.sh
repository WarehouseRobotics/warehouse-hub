#!/bin/sh
# Installs the warehouse-hub services to the system

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)/bin
REPO_DIR=$(cd -- "$SCRIPT_DIR/../.." &> /dev/null && pwd)

echo "Installing warehouse-hub services to the system"

echo "  Installing openclaw-control-api service ..."
cp "$REPO_DIR/openclaw/system-image/userhome/.config/systemd/user/openclaw-control-api.service" $HOME/.config/systemd/user/openclaw-control-api.service
systemctl daemon-reload --user
systemctl enable openclaw-control-api --user
systemctl start openclaw-control-api --user
