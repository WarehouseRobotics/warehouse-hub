#!/bin/sh
# Installs the warehouse-hub CLI control scripts to /usr/bin

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
REPO_DIR=$(cd -- "$SCRIPT_DIR/.." &> /dev/null && pwd)
BUSINESS_API_CLI="$REPO_DIR/business-api/bin/wrobo-biz"

echo $SCRIPT_DIR

echo "Linking CLI scripts to /usr/bin"

echo "  Linking $SCRIPT_DIR/wrobo to /usr/bin/wrobo ..."
unlink /usr/bin/wrobo
ln -s "$SCRIPT_DIR/wrobo" /usr/bin/wrobo

echo "  Linking $SCRIPT_DIR/wrobohub-follow-log to /usr/bin/wrobohub-follow-logs ..."
unlink /usr/bin/wrobohub-follow-logs
ln -s "$SCRIPT_DIR/wrobohub-follow-logs" /usr/bin/wrobohub-follow-logs

echo "  Linking $SCRIPT_DIR/wrobohub-openclaw-restart to /usr/bin/wrobohub-openclaw-restart ..."
unlink /usr/bin/wrobohub-openclaw-restart
ln -s "$SCRIPT_DIR/wrobohub-openclaw-restart" /usr/bin/wrobohub-openclaw-restart

echo "  Linking $SCRIPT_DIR/wrobohub-openclaw-build to /usr/bin/wrobohub-openclaw-build ..."
unlink /usr/bin/wrobohub-openclaw-build
ln -s "$SCRIPT_DIR/wrobohub-openclaw-build" /usr/bin/wrobohub-openclaw-build

echo "  Linking $BUSINESS_API_CLI to /usr/bin/wrobo-biz ..."
unlink /usr/bin/wrobo-biz
ln -s "$BUSINESS_API_CLI" /usr/bin/wrobo-biz

echo "Done"
echo "You can now use the following commands:"
echo "  wrobohub-control - main control script"
echo "  wrobohub-follow-logs - follow live system logs"
echo "  wrobohub-openclaw-restart - restart the Openclaw gateway"
echo "  wrobohub-openclaw-build - build the Openclaw gateway"
echo "  wrobo-biz - business API CLI"
