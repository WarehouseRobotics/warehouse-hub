#!/bin/sh
# Installs the warehouse-hub CLI control scripts to /usr/bin

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)

echo $SCRIPT_DIR

echo "Linking CLI scripts to /usr/bin"

echo "  Linking $SCRIPT_DIR/cli/bin/wrobo to /usr/bin/wrobo ..."
unlink /usr/bin/wrobo
ln -s "$SCRIPT_DIR/cli/bin/wrobo" /usr/bin/wrobo

echo "  Linking $SCRIPT_DIR/cli/bin/wrobohub-follow-log to /usr/bin/wrobohub-follow-logs ..."
unlink /usr/bin/wrobohub-follow-logs
ln -s "$SCRIPT_DIR/cli/bin/wrobohub-follow-logs" /usr/bin/wrobohub-follow-logs

echo "  Linking $SCRIPT_DIR/bin/wrobohub-openclaw-restart to /usr/bin/wrobohub-openclaw-restart ..."
unlink /usr/bin/wrobohub-openclaw-restart
ln -s "$SCRIPT_DIR/cli/bin/wrobohub-openclaw-restart" /usr/bin/wrobohub-openclaw-restart

echo "  Linking $SCRIPT_DIR/cli/bin/wrobohub-openclaw-build to /usr/bin/wrobohub-openclaw-build ..."
unlink /usr/bin/wrobohub-openclaw-build
ln -s "$SCRIPT_DIR/cli/bin/wrobohub-openclaw-build" /usr/bin/wrobohub-openclaw-build

echo "Done"
echo "You can now use the following commands:"
echo "  wrobo - main control script"
echo "  wrobohub-follow-logs - follow live system logs"
echo "  wrobohub-openclaw-restart - restart the Openclaw gateway"
echo "  wrobohub-openclaw-build - build the Openclaw gateway"