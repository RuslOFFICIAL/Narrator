#!/bin/sh
cd "$(dirname "$0")" || exit

# Variables.
SCRIPT_NAME="run.sh"
SCRIPT_PATH="./$SCRIPT_NAME"
CONFIG_NAME="nodemon.json"
FILE_PACKAGE="package.json"
PID_FILE="run.pid"

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

# Stop any other running instances.
if [ -f "$PID_FILE" ]; then
	OLD_PID=$(cat "$PID_FILE")
	if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
		echo "Stopping previous instance (PID: $OLD_PID)..."
		kill -15 "$OLD_PID" 2>/dev/null
		sleep 1
		kill -9 "$OLD_PID" 2>/dev/null
	fi
	rm -f "$PID_FILE"
fi

echo "$$" > "$PID_FILE"
trap "rm -f '$PID_FILE'" EXIT

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

sleep 1
INITIAL_SCRIPT_MTIME=$(get_mtime "$SCRIPT_PATH")
INITIAL_CONFIG_MTIME=$(get_mtime "$CONFIG_NAME")

# Monitor loop.
while kill -0 $BOT_PID 2>/dev/null; do
	sleep 1
	CURRENT_SCRIPT_MTIME=$(get_mtime "$SCRIPT_PATH")
	CURRENT_CONFIG_MTIME=$(get_mtime "$CONFIG_NAME")
	
	[ "$CURRENT_SCRIPT_MTIME" != "$INITIAL_SCRIPT_MTIME" ] && restart_all "$SCRIPT_NAME"
	[ "$CURRENT_CONFIG_MTIME" != "$INITIAL_CONFIG_MTIME" ] && restart_all "$CONFIG_NAME"
done

rm -f "$PID_FILE"
wait $BOT_PID
