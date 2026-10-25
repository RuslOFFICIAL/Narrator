#!/bin/sh
cd "$(dirname "$0")" || exit

# Variables.
SCRIPT_NAME="run.sh"
SCRIPT_PATH="./$SCRIPT_NAME"
CONFIG_NAME="nodemon.json"
FILE_PACKAGE=package.json

# Functions.
get_mtime() {
	stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null
}

restart_all() {
	echo && echo "Changes detected in '$1'. Restarting completely..."
	pkill -P "$BOT_PID" 2>/dev/null
	kill -15 "$BOT_PID" 2>/dev/null
	wait "$BOT_PID" 2>/dev/null
	stty sane 2>/dev/null
	exec sh "$SCRIPT_PATH"
}

echo "Make sure there is sonly one host of bot!"

# Install dependencies.
if [ ! -f "$FILE_PACKAGE" ]; then
	echo && echo "File '$FILE_PACKAGE' not found."
	npm init -y
fi

echo && echo "Configuring npm..."
npm config set fund false --location=project

echo && echo "Installing dependencies..."
npm install

echo && echo "Running vulnerdabiligty audit check..."
npm audit fix --omit=dev

echo

# Startup.
npx --yes nodemon --no-stdin <&0 &
BOT_PID=$!

sleep 5
INITIAL_SCRIPT_MTIME=$(get_mtime "$SCRIPT_PATH")
INITIAL_CONFIG_MTIME=$(get_mtime "$CONFIG_NAME")

# Monitor loop.
while kill -0 $BOT_PID 2>/dev/null; do
	sleep 2
	CURRENT_SCRIPT_MTIME=$(get_mtime "$SCRIPT_PATH")
	CURRENT_CONFIG_MTIME=$(get_mtime "$CONFIG_NAME")
	
	[ "$CURRENT_SCRIPT_MTIME" != "$INITIAL_SCRIPT_MTIME" ] && restart_all "$SCRIPT_NAME"
	[ "$CURRENT_CONFIG_MTIME" != "$INITIAL_CONFIG_MTIME" ] && restart_all "$CONFIG_NAME"
done

wait $BOT_PID
